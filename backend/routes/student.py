from flask import Blueprint, request, jsonify, current_app, send_from_directory
from models.model import db, User, UserRole, StudentProfile, PlacementDrive, Application
from datetime import datetime
from functools import wraps
from celery.result import AsyncResult
from celery_app import celery
from tasks import export_applications_csv
import os
from uuid import uuid4
from werkzeug.utils import secure_filename

student_bp = Blueprint('student', __name__)

ALLOWED_RESUME_EXTENSIONS = {'pdf'}
MAX_RESUME_SIZE = 5 * 1024 * 1024

def allowed_resume(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_RESUME_EXTENSIONS

def student_required(f):
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
            
            if not user or not user.is_active or user.role != UserRole.STUDENT:
                return jsonify({'error': 'Student access required'}), 403
            
            student_profile = StudentProfile.query.filter_by(user_id=user.id).first()
            if not student_profile:
                return jsonify({'error': 'Student profile not found'}), 403
            
            return f(user, student_profile, *args, **kwargs)
            
        except Exception as e:
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function

@student_bp.route('/api/student/drives', methods=['GET'])
@student_required
def get_available_drives(user, student_profile):
    from models.model import CompanyProfile, DriveStatus
    
    search_query = request.args.get('q', '')
    search_company = request.args.get('company', '')
    search_position = request.args.get('position', '')
    
    query = PlacementDrive.query.filter(
        PlacementDrive.status == DriveStatus.APPROVED,
        PlacementDrive.application_deadline > datetime.utcnow()
    )
    
    if search_query:
        query = query.filter(
            (PlacementDrive.title.ilike(f'%{search_query}%')) |
            (PlacementDrive.description.ilike(f'%{search_query}%')) |
            (PlacementDrive.eligibility_criteria.ilike(f'%{search_query}%'))
        )
    
    drives = query.all()
    
    drive_list = []
    for drive in drives:
        company = CompanyProfile.query.get(drive.company_id)
        
        # Filter by company name if specified
        if search_company and company and search_company.lower() not in company.company_name.lower():
            continue
        
        # Filter by job title if specified
        if search_position and search_position.lower() not in drive.job_title.lower():
            continue
        
        # Check if student already applied
        already_applied = Application.query.filter_by(
            student_id=student_profile.id,
            drive_id=drive.id
        ).first()
        
        if not already_applied:
            drive_list.append({
                'id': drive.id,
                'drive_code': drive.drive_code,
                'title': drive.title,
                'job_title': drive.job_title,
                'description': drive.description,
                'salary': drive.salary,
                'location': drive.location,
                'company_name': company.company_name if company else 'Unknown',
                'application_deadline': drive.application_deadline.isoformat() if drive.application_deadline else None
            })
    
    return jsonify({'drives': drive_list})

@student_bp.route('/api/student/applications', methods=['GET'])
@student_required
def get_student_applications(user, student_profile):
    applications = Application.query.filter_by(student_id=student_profile.id).all()
    
    application_list = []
    for app in applications:
        drive = PlacementDrive.query.get(app.drive_id)
        from models.model import CompanyProfile
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


@student_bp.route('/api/student/application-export', methods=['POST'])
@student_required
def request_application_export(user, student_profile):
    """Queue CSV creation; completion is reported by the status endpoint."""
    task = export_applications_csv.delay(student_profile.id)
    return jsonify({
        'message': 'Your CSV export has been queued. You will be alerted here when it is ready.',
        'task_id': task.id,
    }), 202


@student_bp.route('/api/student/application-export/<task_id>', methods=['GET'])
@student_required
def get_application_export_status(user, student_profile, task_id):
    task = AsyncResult(task_id, app=celery)
    response = {'task_id': task_id, 'status': task.status}

    if task.successful():
        result = task.result
        if result.get('student_profile_id') != student_profile.id:
            return jsonify({'error': 'Export not found'}), 404
        response.update({
            'message': 'Your application-history CSV is ready to download.',
            'row_count': result['row_count'],
            'download_url': f'/api/student/application-export/{task_id}/download',
        })
    elif task.failed():
        response['message'] = 'The export could not be created. Please try again.'

    return jsonify(response)


@student_bp.route('/api/student/application-export/<task_id>/download', methods=['GET'])
@student_required
def download_application_export(user, student_profile, task_id):
    task = AsyncResult(task_id, app=celery)
    if not task.successful() or not isinstance(task.result, dict):
        return jsonify({'error': 'Export is not ready'}), 404

    result = task.result
    if result.get('student_profile_id') != student_profile.id:
        return jsonify({'error': 'Export not found'}), 404

    filename = result.get('filename', '')
    if not filename or os.path.basename(filename) != filename:
        return jsonify({'error': 'Export file not found'}), 404
    export_dir = os.path.join(current_app.root_path, 'exports')
    if not os.path.isfile(os.path.join(export_dir, filename)):
        return jsonify({'error': 'Export file has expired'}), 404
    return send_from_directory(export_dir, filename, as_attachment=True)

@student_bp.route('/api/student/applications', methods=['POST'])
@student_required
def apply_for_drive(user, student_profile):
    data = request.get_json()
    drive_id = data.get('drive_id')
    
    if not drive_id:
        return jsonify({'error': 'Drive ID required'}), 400
    
    drive = PlacementDrive.query.get(drive_id)
    if not drive:
        return jsonify({'error': 'Drive not found'}), 404

    resume_file = os.path.join(current_app.root_path, 'uploads', 'resumes', student_profile.resume_path or '')
    if not student_profile.resume_path or not os.path.isfile(resume_file):
        return jsonify({'error': 'Upload your resume in your profile before applying to a drive'}), 400
    
    # Check if already applied
    existing = Application.query.filter_by(
        student_id=student_profile.id,
        drive_id=drive_id
    ).first()
    
    if existing:
        return jsonify({'error': 'Already applied to this drive'}), 400
    
    # Check eligibility
    if drive.min_cgpa and student_profile.cgpa < drive.min_cgpa:
        return jsonify({'error': 'CGPA below minimum requirement'}), 400
    
    if drive.eligible_departments:
        eligible_depts = [d.strip() for d in drive.eligible_departments.split(',')]
        if student_profile.department not in eligible_depts:
            return jsonify({'error': 'Department not eligible'}), 400
    
    application = Application(
        student_id=student_profile.id,
        drive_id=drive_id
    )
    
    db.session.add(application)
    db.session.commit()
    
    return jsonify({'message': 'Application submitted successfully'}), 201

@student_bp.route('/api/student/profile', methods=['GET'])
@student_required
def get_student_profile(user, student_profile):
    import json
    return jsonify({
        'id': student_profile.id,
        'first_name': student_profile.first_name,
        'last_name': student_profile.last_name,
        'roll_number': student_profile.roll_number,
        'department': student_profile.department,
        'semester': student_profile.semester,
        'cgpa': student_profile.cgpa,
        'graduation_year': student_profile.graduation_year,
        'phone': student_profile.phone,
        'has_resume': bool(student_profile.resume_path),
        'resume_filename': student_profile.resume_path,
        'email': user.email,
        'education': json.loads(student_profile.education) if student_profile.education else [],
        'skills': json.loads(student_profile.skills) if student_profile.skills else [],
        'experience': json.loads(student_profile.experience) if student_profile.experience else []
    })

@student_bp.route('/api/student/profile', methods=['PUT'])
@student_required
def update_student_profile(user, student_profile):
    import json
    data = request.get_json()
    
    student_profile.first_name = data.get('first_name', student_profile.first_name)
    student_profile.last_name = data.get('last_name', student_profile.last_name)
    student_profile.roll_number = data.get('roll_number', student_profile.roll_number)
    student_profile.department = data.get('department', student_profile.department)
    student_profile.semester = data.get('semester', student_profile.semester)
    student_profile.cgpa = data.get('cgpa', student_profile.cgpa)
    student_profile.graduation_year = data.get('graduation_year', student_profile.graduation_year)
    student_profile.phone = data.get('phone', student_profile.phone)
    
    if data.get('education') is not None:
        student_profile.education = json.dumps(data.get('education'))
    if data.get('skills') is not None:
        student_profile.skills = json.dumps(data.get('skills'))
    if data.get('experience') is not None:
        student_profile.experience = json.dumps(data.get('experience'))
    
    db.session.commit()
    
    return jsonify({'message': 'Profile updated successfully'})

@student_bp.route('/api/student/profile/resume', methods=['POST'])
@student_required
def upload_resume(user, student_profile):
    resume = request.files.get('resume')
    if not resume or not resume.filename:
        return jsonify({'error': 'Choose a PDF resume to upload'}), 400
    if not allowed_resume(resume.filename):
        return jsonify({'error': 'Only PDF resumes are allowed'}), 400

    resume.seek(0, os.SEEK_END)
    size = resume.tell()
    resume.seek(0)
    if size > MAX_RESUME_SIZE:
        return jsonify({'error': 'Resume must be 5 MB or smaller'}), 400

    upload_dir = os.path.join(current_app.root_path, 'uploads', 'resumes')
    os.makedirs(upload_dir, exist_ok=True)
    original_name = secure_filename(resume.filename)
    filename = f'{student_profile.id}_{uuid4().hex}_{original_name}'
    resume.save(os.path.join(upload_dir, filename))

    if student_profile.resume_path:
        old_file = os.path.join(upload_dir, student_profile.resume_path)
        if os.path.isfile(old_file):
            os.remove(old_file)

    student_profile.resume_path = filename
    db.session.commit()
    return jsonify({'message': 'Resume uploaded successfully', 'resume_filename': filename}), 201
