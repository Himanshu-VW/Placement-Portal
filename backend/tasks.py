"""Long-running/background tasks for the placement portal."""
import csv
import importlib.util
import os
import smtplib
import sys
import uuid
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from zoneinfo import ZoneInfo

from celery_app import celery

# Celery can set its own import path when launched on Windows. Keep the backend
# directory importable and load the Flask module by its absolute path.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _get_flask_app():
    """Load Flask from this backend folder, independent of Celery's CWD."""
    # Celery can alter sys.path after importing task modules on Windows, so this
    # must be done at execution time as well as module-import time.
    sys.path.insert(0, BACKEND_DIR)
    module_name = 'placement_portal_flask_app'
    if module_name in sys.modules:
        return sys.modules[module_name].app

    app_path = os.path.join(BACKEND_DIR, 'app.py')
    spec = importlib.util.spec_from_file_location(module_name, app_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module.app


@celery.task(bind=True, name='placement_portal.export_applications_csv')
def export_applications_csv(self, student_profile_id):
    """Create one student's application-history CSV and return its metadata."""
    # Load lazily so the Celery worker can start independently of Flask.
    app = _get_flask_app()
    from models.model import Application, CompanyProfile, PlacementDrive, StudentProfile

    with app.app_context():
        student = StudentProfile.query.get(student_profile_id)
        if not student:
            raise ValueError('Student profile not found')

        export_dir = os.path.join(app.root_path, 'exports')
        os.makedirs(export_dir, exist_ok=True)
        filename = f'applications_{student.id}_{uuid.uuid4().hex}.csv'
        file_path = os.path.join(export_dir, filename)

        applications = (
            Application.query.filter_by(student_id=student.id)
            .order_by(Application.applied_at.desc())
            .all()
        )

        with open(file_path, 'w', newline='', encoding='utf-8-sig') as csv_file:
            writer = csv.DictWriter(
                csv_file,
                fieldnames=[
                    'Student ID', 'Company Name', 'Drive Title', 'Application Status',
                    'Application Date', 'Status Last Updated', 'Interview Date',
                ],
            )
            writer.writeheader()
            for application in applications:
                drive = PlacementDrive.query.get(application.drive_id)
                company = CompanyProfile.query.get(drive.company_id) if drive else None
                writer.writerow({
                    'Student ID': student.roll_number or student.id,
                    'Company Name': company.company_name if company else 'Unknown',
                    'Drive Title': drive.title if drive else 'Unknown',
                    'Application Status': application.status.value,
                    'Application Date': _format_date(application.applied_at),
                    'Status Last Updated': _format_date(application.updated_at),
                    'Interview Date': _format_date(application.interview_scheduled),
                })

        return {
            'student_profile_id': student.id,
            'filename': filename,
            'created_at': datetime.utcnow().isoformat(),
            'row_count': len(applications),
        }


def _format_date(value):
    return value.isoformat(sep=' ', timespec='seconds') if value else ''


@celery.task(bind=True, name='placement_portal.send_daily_deadline_reminders')
def send_daily_deadline_reminders(self):
    """Email each active student one summary of approved drives closing soon.

    The look-ahead window defaults to seven days and can be adjusted through
    REMINDER_LOOKAHEAD_DAYS. Students who have already applied for a drive are
    excluded from that drive's reminder.
    """
    try:
        lookahead_days = int(os.getenv('REMINDER_LOOKAHEAD_DAYS', '7'))
    except ValueError as exc:
        raise ValueError('REMINDER_LOOKAHEAD_DAYS must be a whole number') from exc
    if lookahead_days < 1:
        raise ValueError('REMINDER_LOOKAHEAD_DAYS must be at least 1')

    app = _get_flask_app()
    from models.model import Application, CompanyProfile, DriveStatus, PlacementDrive, StudentProfile, User, UserRole

    with app.app_context():
        now = datetime.now(ZoneInfo('Asia/Kolkata')).replace(tzinfo=None)
        deadline_cutoff = now + timedelta(days=lookahead_days)
        drives = (
            PlacementDrive.query.filter(
                PlacementDrive.status == DriveStatus.APPROVED,
                PlacementDrive.application_deadline > now,
                PlacementDrive.application_deadline <= deadline_cutoff,
            )
            .order_by(PlacementDrive.application_deadline.asc())
            .all()
        )
        if not drives:
            return {'recipients': 0, 'reminders_sent': 0, 'drives': 0}

        companies = {
            company.id: company.company_name
            for company in CompanyProfile.query.filter(
                CompanyProfile.id.in_([drive.company_id for drive in drives])
            ).all()
        }
        active_students = (
            StudentProfile.query.join(User, StudentProfile.user_id == User.id)
            .filter(User.role == UserRole.STUDENT, User.is_active.is_(True), User.is_blacklisted.is_(False))
            .all()
        )
        sent = 0
        recipients = 0
        drive_ids = [drive.id for drive in drives]
        for student in active_students:
            user = User.query.get(student.user_id)
            applied_drive_ids = {
                application.drive_id
                for application in Application.query.filter(
                    Application.student_id == student.id,
                    Application.drive_id.in_(drive_ids),
                ).all()
            }
            available_drives = [drive for drive in drives if drive.id not in applied_drive_ids]
            if not available_drives:
                continue

            recipients += 1
            _send_html_email(
                recipient=user.email,
                subject='Reminder: placement application deadlines are approaching',
                html=_build_deadline_reminder_html(student, available_drives, companies, lookahead_days),
            )
            sent += 1

        return {'recipients': recipients, 'reminders_sent': sent, 'drives': len(drives)}


def _build_deadline_reminder_html(student, drives, companies, lookahead_days):
    """Build an aggregated, HTML-escaped deadline reminder for one student."""
    from html import escape

    student_name = ' '.join(filter(None, [student.first_name, student.last_name])) or 'Student'
    rows = ''.join(
        '<tr>'
        f'<td style="padding:10px;border:1px solid #dbe3ef">{escape(companies.get(drive.company_id, "Unknown"))}</td>'
        f'<td style="padding:10px;border:1px solid #dbe3ef">{escape(drive.title)}<br><small>{escape(drive.job_title)}</small></td>'
        f'<td style="padding:10px;border:1px solid #dbe3ef;white-space:nowrap">{drive.application_deadline:%d %b %Y, %I:%M %p}</td>'
        '</tr>'
        for drive in drives
    )
    return f'''<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1f2937">
  <div style="max-width:680px;margin:auto;padding:24px;border:1px solid #dbe3ef;border-radius:8px">
    <h2 style="color:#4338ca">Application deadline reminder</h2>
    <p>Hello {escape(student_name)},</p>
    <p>The following placement drives close within the next {lookahead_days} day(s). Apply from your student dashboard before their deadlines.</p>
    <table style="border-collapse:collapse;width:100%"><thead><tr style="background:#eef2ff">
      <th style="padding:10px;border:1px solid #dbe3ef;text-align:left">Company</th>
      <th style="padding:10px;border:1px solid #dbe3ef;text-align:left">Drive</th>
      <th style="padding:10px;border:1px solid #dbe3ef;text-align:left">Deadline</th>
    </tr></thead><tbody>{rows}</tbody></table>
    <p style="margin-top:20px;color:#6b7280">You are receiving this daily reminder because you have not yet applied to these drives.</p>
  </div>
</body></html>'''


@celery.task(bind=True, name='placement_portal.send_monthly_activity_report')
def send_monthly_activity_report(self, report_period='previous'):
    """Email the admin a monthly report for the previous month or month-to-date."""
    if report_period not in ('previous', 'current'):
        raise ValueError('report_period must be previous or current')

    app = _get_flask_app()
    from models.model import Application, ApplicationStatus, DriveStatus, PlacementDrive, User, UserRole, db

    with app.app_context():
        now = datetime.now(ZoneInfo('Asia/Kolkata')).replace(tzinfo=None)
        current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if report_period == 'previous':
            period_end = current_month_start
            period_start = (current_month_start - timedelta(days=1)).replace(day=1)
            report_title = 'Monthly Placement Activity Report'
        else:
            period_start = current_month_start
            period_end = now
            report_title = 'Month-to-Date Placement Activity Report'

        drives_conducted = PlacementDrive.query.filter(
            PlacementDrive.created_at >= period_start,
            PlacementDrive.created_at < period_end,
            PlacementDrive.status.in_([DriveStatus.COMPLETED, DriveStatus.ONGOING, DriveStatus.APPROVED]),
        ).count()
        students_applied = db.session.query(Application.student_id).filter(
            Application.applied_at >= period_start,
            Application.applied_at < period_end,
        ).distinct().count()
        students_selected = db.session.query(Application.student_id).filter(
            Application.updated_at >= period_start,
            Application.updated_at < period_end,
            Application.status.in_([ApplicationStatus.SELECTED, ApplicationStatus.PLACED]),
        ).distinct().count()

        admin = User.query.filter_by(role=UserRole.ADMIN).first()
        recipient = os.getenv('ADMIN_REPORT_EMAIL') or (admin.email if admin else None)
        if not recipient:
            raise ValueError('Admin email address is not configured')

        html = _build_monthly_report_html(
            report_title, period_start, period_end, report_period,
            drives_conducted, students_applied, students_selected,
        )
        _send_html_email(
            recipient=recipient,
            subject=f'{report_title} - {period_start:%B %Y}',
            html=html,
        )
        return {
            'report_period': report_period,
            'recipient': recipient,
            'drives_conducted': drives_conducted,
            'students_applied': students_applied,
            'students_selected': students_selected,
        }


def _build_monthly_report_html(title, period_start, period_end, report_period, drives, applied, selected):
    end_label = (period_end - timedelta(days=1)).date() if report_period == 'previous' else period_end.date()
    rows = (
        ('Drives conducted', drives),
        ('Students applied', applied),
        ('Students selected', selected),
    )
    row_html = ''.join(
        f'<tr><td style="padding:12px;border:1px solid #dbe3ef">{label}</td>'
        f'<td style="padding:12px;border:1px solid #dbe3ef;text-align:center"><b>{value}</b></td></tr>'
        for label, value in rows
    )
    return f'''<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1f2937">
  <div style="max-width:620px;margin:auto;padding:24px;border:1px solid #dbe3ef;border-radius:8px">
    <h2 style="color:#4338ca">{title}</h2>
    <p>Reporting period: <b>{period_start:%d %b %Y}</b> to <b>{end_label:%d %b %Y}</b></p>
    <table style="border-collapse:collapse;width:100%"><thead><tr style="background:#eef2ff">
      <th style="padding:12px;border:1px solid #dbe3ef;text-align:left">Metric</th>
      <th style="padding:12px;border:1px solid #dbe3ef">Count</th>
    </tr></thead><tbody>{row_html}</tbody></table>
    <p style="margin-top:20px;color:#6b7280">Generated by Placement Portal.</p>
  </div>
</body></html>'''


def _send_html_email(recipient, subject, html):
    """Send email using SMTP values provided as environment variables."""
    host = os.getenv('SMTP_HOST')
    sender = os.getenv('SMTP_FROM')
    if not host or not sender:
        raise RuntimeError('Set SMTP_HOST and SMTP_FROM before sending monthly reports')

    port = int(os.getenv('SMTP_PORT', '587'))
    username = os.getenv('SMTP_USERNAME')
    password = os.getenv('SMTP_PASSWORD')
    message = MIMEText(html, 'html', 'utf-8')
    message['Subject'] = subject
    message['From'] = sender
    message['To'] = recipient

    with smtplib.SMTP(host, port, timeout=30) as server:
        if os.getenv('SMTP_USE_TLS', 'true').lower() == 'true':
            server.starttls()
        if username and password:
            server.login(username, password)
        server.sendmail(sender, [recipient], message.as_string())
