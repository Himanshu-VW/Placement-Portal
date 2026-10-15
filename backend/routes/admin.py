from flask import Blueprint, request, jsonify
from models.model import db, User, UserRole, CompanyProfile, StudentProfile, PlacementDrive, Application, DriveStatus
from functools import wraps
from celery.result import AsyncResult
from celery_app import celery
from tasks import send_daily_deadline_reminders, send_monthly_activity_report

admin_bp = Blueprint('admin', __name__)

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Allow OPTIONS requests for CORS preflight
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        
        try:
            if token.startswith('Bearer '):
                token = token[7:]
            
            import jwt
            payload = jwt.decode(token, 'your-secret-key-change-in-production', algorithms=['HS256'])
            
            user = User.query.get(payload['user_id'])
            
            if not user or not user.is_active or user.role != UserRole.ADMIN:
                return jsonify({'error': 'Admin access required'}), 403
            
            return f(*args, **kwargs)
            
        except Exception as e:
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function

@admin_bp.route('/api/admin/dashboard-stats', methods=['GET'])
@admin_required
def get_dashboard_stats():
    total_students = StudentProfile.query.count()
    total_companies = CompanyProfile.query.count()
    total_drives = PlacementDrive.query.count()
    total_applications = Application.query.count()
    
    return jsonify({
        'total_students': total_students,
        'total_companies': total_companies,
        'total_drives': total_drives,
        'total_applications': total_applications
    })


@admin_bp.route('/api/admin/deadline-reminders', methods=['POST'])
@admin_required
def trigger_deadline_reminders():
    """Queue the same reminder run used by the daily Celery Beat schedule."""
    task = send_daily_deadline_reminders.delay()
    return jsonify({
        'message': 'Daily deadline reminders have been queued for delivery.',
        'task_id': task.id,
    }), 202


@admin_bp.route('/api/admin/deadline-reminders/<task_id>', methods=['GET'])
@admin_required
def get_deadline_reminder_status(task_id):
    task = AsyncResult(task_id, app=celery)
    response = {'task_id': task_id, 'status': task.status}
    if task.successful():
        result = task.result
        response.update({
            'message': f"Deadline reminders sent to {result['reminders_sent']} student(s).",
            'result': result,
        })
    elif task.failed():
        response['message'] = 'The reminders could not be emailed. Check the Celery worker SMTP error and configuration.'
    return jsonify(response)


@admin_bp.route('/api/admin/monthly-report', methods=['POST'])
@admin_required
def trigger_month_to_date_report():
    """Queue an email report covering this month up to the current time."""
    task = send_monthly_activity_report.delay('current')
    return jsonify({
        'message': 'The current month-to-date report has been queued for email delivery.',
        'task_id': task.id,
    }), 202


@admin_bp.route('/api/admin/monthly-report/<task_id>', methods=['GET'])
@admin_required
def get_monthly_report_status(task_id):
    task = AsyncResult(task_id, app=celery)
    response = {'task_id': task_id, 'status': task.status}
    if task.successful():
        response.update({
            'message': f"Report sent to {task.result['recipient']}.",
            'report': task.result,
        })
    elif task.failed():
        response['message'] = 'The report could not be emailed. Check the Celery worker SMTP error and configuration.'
    return jsonify(response)

@admin_bp.route('/api/admin/companies', methods=['GET'])
@admin_required
def get_companies():
    companies = CompanyProfile.query.all()
    
    company_list = []
    for company in companies:
        user = User.query.get(company.user_id)
        company_list.append({
            'id': company.id,
            'user_id': company.user_id,
            'company_name': company.company_name,
            'industry': company.industry,
            'email': company.contact_email,
            'is_approved': company.is_approved,
            'is_active': user.is_active if user else False,
            'is_blacklisted': user.is_blacklisted if user else False,
            'created_at': company.created_at.isoformat() if company.created_at else None
        })
    
    return jsonify({'companies': company_list})

@admin_bp.route('/api/admin/companies/<int:company_id>/approve', methods=['POST'])
@admin_required
def approve_company(company_id):
    company = CompanyProfile.query.get(company_id)
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    company.is_approved = True
    db.session.commit()
    
    return jsonify({'message': 'Company approved successfully'})

@admin_bp.route('/api/admin/drives', methods=['GET'])
@admin_required
def get_drives():
    drives = PlacementDrive.query.all()
    
    drive_list = []
    for drive in drives:
        company = CompanyProfile.query.get(drive.company_id)
        drive_list.append({
            'id': drive.id,
            'drive_code': drive.drive_code,
            'title': drive.title,
            'job_title': drive.job_title,
            'company_name': company.company_name if company else 'Unknown',
            'status': drive.status.value,
            'application_deadline': drive.application_deadline.isoformat() if drive.application_deadline else None,
            'created_at': drive.created_at.isoformat() if drive.created_at else None
        })
    
    return jsonify({'drives': drive_list})

@admin_bp.route('/api/admin/drives/<int:drive_id>/approve', methods=['POST'])
@admin_required
def approve_drive(drive_id):
    drive = PlacementDrive.query.get(drive_id)
    if not drive:
        return jsonify({'error': 'Drive not found'}), 404
    
    drive.status = DriveStatus.APPROVED
    db.session.commit()
    
    return jsonify({'message': 'Drive approved successfully'})

@admin_bp.route('/api/admin/search/companies', methods=['GET'])
@admin_required
def search_companies():
    query = request.args.get('q', '')
    
    if not query:
        return jsonify({'companies': []})
    
    companies = CompanyProfile.query.filter(
        (CompanyProfile.company_name.ilike(f'%{query}%')) |
        (CompanyProfile.industry.ilike(f'%{query}%'))
    ).all()
    
    company_list = []
    for company in companies:
        user = User.query.get(company.user_id)
        company_list.append({
            'id': company.id,
            'user_id': company.user_id,
            'company_name': company.company_name,
            'industry': company.industry,
            'email': company.contact_email,
            'is_approved': company.is_approved,
            'is_active': user.is_active if user else False,
            'is_blacklisted': user.is_blacklisted if user else False
        })
    
    return jsonify({'companies': company_list})

@admin_bp.route('/api/admin/search/students', methods=['GET'])
@admin_required
def search_students():
    query = request.args.get('q', '')
    
    if not query:
        return jsonify({'students': []})
    
    students = StudentProfile.query.filter(
        (StudentProfile.first_name.ilike(f'%{query}%')) |
        (StudentProfile.last_name.ilike(f'%{query}%')) |
        (StudentProfile.roll_number.ilike(f'%{query}%')) |
        (StudentProfile.phone.ilike(f'%{query}%'))
    ).all()
    
    student_list = []
    for student in students:
        user = User.query.get(student.user_id)
        student_list.append({
            'id': student.id,
            'user_id': student.user_id,
            'name': f"{student.first_name} {student.last_name}",
            'roll_number': student.roll_number,
            'department': student.department,
            'email': user.email if user else None,
            'is_active': user.is_active if user else False,
            'is_blacklisted': user.is_blacklisted if user else False
        })
    
    return jsonify({'students': student_list})

@admin_bp.route('/api/admin/users/<int:user_id>/blacklist', methods=['POST'])
@admin_required
def blacklist_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    if user.role == UserRole.ADMIN:
        return jsonify({'error': 'Cannot blacklist admin'}), 403
    
    user.is_blacklisted = True
    user.is_active = False
    db.session.commit()
    
    return jsonify({'message': 'User blacklisted successfully'})

@admin_bp.route('/api/admin/users/<int:user_id>/unblacklist', methods=['POST'])
@admin_required
def unblacklist_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    user.is_blacklisted = False
    user.is_active = True
    db.session.commit()
    
    return jsonify({'message': 'User unblacklisted successfully'})

@admin_bp.route('/api/admin/users/<int:user_id>/deactivate', methods=['POST'])
@admin_required
def deactivate_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    if user.role == UserRole.ADMIN:
        return jsonify({'error': 'Cannot deactivate admin'}), 403
    
    user.is_active = False
    db.session.commit()
    
    return jsonify({'message': 'User deactivated successfully'})

@admin_bp.route('/api/admin/users/<int:user_id>/activate', methods=['POST'])
@admin_required
def activate_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    user.is_active = True
    db.session.commit()
    
    return jsonify({'message': 'User activated successfully'})

@admin_bp.route('/api/admin/students/<int:student_id>/profile', methods=['GET'])
@admin_required
def get_student_profile(student_id):
    import json
    from models.model import StudentProfile
    
    student_profile = StudentProfile.query.get(student_id)
    if not student_profile:
        return jsonify({'error': 'Student profile not found'}), 404
    
    user = User.query.get(student_profile.user_id)
    
    return jsonify({
        'id': student_profile.id,
        'user_id': student_profile.user_id,
        'first_name': student_profile.first_name,
        'last_name': student_profile.last_name,
        'roll_number': student_profile.roll_number,
        'department': student_profile.department,
        'semester': student_profile.semester,
        'cgpa': student_profile.cgpa,
        'graduation_year': student_profile.graduation_year,
        'phone': student_profile.phone,
        'email': user.email if user else None,
        'education': json.loads(student_profile.education) if student_profile.education else [],
        'skills': json.loads(student_profile.skills) if student_profile.skills else [],
        'experience': json.loads(student_profile.experience) if student_profile.experience else []
    })

@admin_bp.route('/api/admin/students/<int:student_id>/applications', methods=['GET'])
@admin_required
def get_student_applications(student_id):
    from models.model import StudentProfile, CompanyProfile
    
    student_profile = StudentProfile.query.get(student_id)
    if not student_profile:
        return jsonify({'error': 'Student profile not found'}), 404
    
    applications = Application.query.filter_by(student_id=student_id).all()
    
    application_list = []
    for app in applications:
        drive = PlacementDrive.query.get(app.drive_id)
        company = CompanyProfile.query.get(drive.company_id) if drive else None
        
        application_list.append({
            'id': app.id,
            'company_name': company.company_name if company else 'Unknown',
            'drive_title': drive.title if drive else 'Unknown',
            'job_title': drive.job_title if drive else 'Unknown',
            'status': app.status.value,
            'applied_at': app.applied_at.isoformat() if app.applied_at else None,
            'remarks': app.remarks,
            'interview_scheduled': app.interview_scheduled.isoformat() if app.interview_scheduled else None,
            'interview_feedback': app.interview_feedback,
            'offer_letter_path': app.offer_letter_path,
            'offer_status': app.offer_status
        })
    
    return jsonify({'applications': application_list})

@admin_bp.route('/api/admin/students', methods=['GET'])
@admin_required
def get_students():
    students = StudentProfile.query.all()
    
    student_list = []
    for student in students:
        user = User.query.get(student.user_id)
        student_list.append({
            'id': student.id,
            'user_id': student.user_id,
            'name': f"{student.first_name} {student.last_name}",
            'roll_number': student.roll_number,
            'department': student.department,
            'semester': student.semester,
            'cgpa': student.cgpa,
            'email': user.email if user else None,
            'is_active': user.is_active if user else False,
            'is_blacklisted': user.is_blacklisted if user else False
        })
    
    return jsonify({'students': student_list})

@admin_bp.route('/api/admin/applications', methods=['GET'])
@admin_required
def get_all_applications():
    applications = Application.query.all()
    
    application_list = []
    for app in applications:
        student = StudentProfile.query.get(app.student_id)
        drive = PlacementDrive.query.get(app.drive_id)
        company = CompanyProfile.query.get(drive.company_id) if drive else None
        
        application_list.append({
            'id': app.id,
            'student_name': f"{student.first_name} {student.last_name}" if student else 'Unknown',
            'student_roll': student.roll_number if student else 'Unknown',
            'company_name': company.company_name if company else 'Unknown',
            'drive_title': drive.title if drive else 'Unknown',
            'job_title': drive.job_title if drive else 'Unknown',
            'status': app.status.value,
            'applied_at': app.applied_at.isoformat() if app.applied_at else None
        })
    
    return jsonify({'applications': application_list})
