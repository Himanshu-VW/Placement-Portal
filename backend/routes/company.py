from flask import Blueprint, request, jsonify, current_app, send_from_directory
from models.model import db, User, UserRole, CompanyProfile, PlacementDrive, Application, ApplicationStatus, DriveStatus
from datetime import datetime
from functools import wraps
import os

company_bp = Blueprint('company', __name__)

def company_required(f):
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
            
            if not user or not user.is_active or user.role != UserRole.COMPANY:
                return jsonify({'error': 'Company access required'}), 403
            
            company_profile = CompanyProfile.query.filter_by(user_id=user.id).first()
            if not company_profile or not company_profile.is_approved:
                return jsonify({'error': 'Company not approved'}), 403
            
            return f(user, company_profile, *args, **kwargs)
            
        except Exception as e:
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function

@company_bp.route('/api/company/profile', methods=['GET'])
@company_required
def get_company_profile(user, company_profile):
    return jsonify({
        'id': company_profile.id,
        'company_name': company_profile.company_name,
        'industry': company_profile.industry,
        'description': company_profile.description,
        'website': company_profile.website,
        'location': company_profile.location,
        'contact_person': company_profile.contact_person,
        'contact_phone': company_profile.contact_phone,
        'contact_email': company_profile.contact_email,
        'is_approved': company_profile.is_approved
    })

@company_bp.route('/api/company/profile', methods=['PUT'])
@company_required
def update_company_profile(user, company_profile):
    data = request.get_json()
    
    company_profile.company_name = data.get('company_name', company_profile.company_name)
    company_profile.industry = data.get('industry', company_profile.industry)
    company_profile.description = data.get('description', company_profile.description)
    company_profile.website = data.get('website', company_profile.website)
    company_profile.location = data.get('location', company_profile.location)
    company_profile.contact_person = data.get('contact_person', company_profile.contact_person)
    company_profile.contact_phone = data.get('contact_phone', company_profile.contact_phone)
    company_profile.contact_email = data.get('contact_email', company_profile.contact_email)
    
    db.session.commit()
    
    return jsonify({'message': 'Profile updated successfully'})

@company_bp.route('/api/company/drives', methods=['GET'])
@company_required
def get_company_drives(user, company_profile):
    drives = PlacementDrive.query.filter_by(company_id=company_profile.id).all()
    
    drive_list = []
    for drive in drives:
        applications_count = Application.query.filter_by(drive_id=drive.id).count()
        drive_list.append({
            'id': drive.id,
            'drive_code': drive.drive_code,
            'title': drive.title,
            'job_title': drive.job_title,
            'description': drive.description,
            'salary': drive.salary,
            'location': drive.location,
            'status': drive.status.value,
            'application_deadline': drive.application_deadline.isoformat() if drive.application_deadline else None,
            'applications_count': applications_count,
            'created_at': drive.created_at.isoformat() if drive.created_at else None
        })
    
    return jsonify({'drives': drive_list})

@company_bp.route('/api/company/drives', methods=['POST'])
@company_required
def create_drive(user, company_profile):
    data = request.get_json()

    required_fields = {
        'title': 'Drive title',
        'job_title': 'Job title',
        'description': 'Job description',
        'location': 'Location',
        'application_deadline': 'Application deadline'
    }
    missing = [label for field, label in required_fields.items() if not data.get(field)]
    if missing:
        return jsonify({'error': f"Required: {', '.join(missing)}"}), 400

    try:
        application_deadline = datetime.fromisoformat(data['application_deadline'])
    except (TypeError, ValueError):
        return jsonify({'error': 'Application deadline is invalid'}), 400
    
    import uuid
    drive_code = f"DRV-{uuid.uuid4().hex[:8].upper()}"
    
    drive = PlacementDrive(
        drive_code=drive_code,
        company_id=company_profile.id,
        title=data.get('title'),
        job_title=data.get('job_title'),
        description=data.get('description'),
        salary=data.get('salary'),
        location=data.get('location'),
        eligibility_criteria=data.get('eligibility_criteria'),
        min_cgpa=data.get('min_cgpa', 0.0),
        eligible_departments=data.get('eligible_departments'),
        application_deadline=application_deadline,
        status=DriveStatus.PENDING
    )
    
    db.session.add(drive)
    db.session.commit()
    
    return jsonify({
        'message': 'Drive created successfully',
        'drive': {
            'id': drive.id,
            'drive_code': drive.drive_code,
            'title': drive.title,
            'job_title': drive.job_title
        }
    }), 201

@company_bp.route('/api/company/drives/<int:drive_id>', methods=['PUT'])
@company_required
def update_drive(user, company_profile, drive_id):
    drive = PlacementDrive.query.filter_by(id=drive_id, company_id=company_profile.id).first()
    if not drive:
        return jsonify({'error': 'Drive not found'}), 404
    
    data = request.get_json()
    
    drive.title = data.get('title', drive.title)
    drive.job_title = data.get('job_title', drive.job_title)
    drive.description = data.get('description', drive.description)
    drive.salary = data.get('salary', drive.salary)
    drive.location = data.get('location', drive.location)
    drive.eligibility_criteria = data.get('eligibility_criteria', drive.eligibility_criteria)
    drive.min_cgpa = data.get('min_cgpa', drive.min_cgpa)
    drive.eligible_departments = data.get('eligible_departments', drive.eligible_departments)
    
    if data.get('application_deadline'):
        drive.application_deadline = datetime.fromisoformat(data.get('application_deadline'))
    
    if data.get('status'):
        drive.status = DriveStatus(data.get('status'))
    
    db.session.commit()
    
    return jsonify({'message': 'Drive updated successfully'})

@company_bp.route('/api/company/drives/<int:drive_id>', methods=['DELETE'])
@company_required
def delete_drive(user, company_profile, drive_id):
    drive = PlacementDrive.query.filter_by(id=drive_id, company_id=company_profile.id).first()
    if not drive:
        return jsonify({'error': 'Drive not found'}), 404
    
    db.session.delete(drive)
    db.session.commit()
    
    return jsonify({'message': 'Drive deleted successfully'})

@company_bp.route('/api/company/drives/<int:drive_id>/applications', methods=['GET'])
@company_required
def get_drive_applications(user, company_profile, drive_id):
    drive = PlacementDrive.query.filter_by(id=drive_id, company_id=company_profile.id).first()
    if not drive:
        return jsonify({'error': 'Drive not found'}), 404
    
    applications = Application.query.filter_by(drive_id=drive_id).all()
    
    application_list = []
    for app in applications:
        from models.model import StudentProfile
        student = StudentProfile.query.get(app.student_id)
        student_user = User.query.get(student.user_id) if student else None
        
        application_list.append({
            'id': app.id,
            'student_id': app.student_id,
            'student_name': f"{student.first_name} {student.last_name}" if student else 'Unknown',
            'student_roll': student.roll_number if student else 'Unknown',
            'student_email': student_user.email if student_user else 'Unknown',
            'student_department': student.department if student else 'Unknown',
            'student_cgpa': student.cgpa if student else None,
            'resume_available': bool(student and student.resume_path),
            'status': app.status.value,
            'applied_at': app.applied_at.isoformat() if app.applied_at else None,
            'remarks': app.remarks
        })
    
    return jsonify({'applications': application_list})

@company_bp.route('/api/company/applications/<int:application_id>/resume', methods=['GET'])
@company_required
def download_application_resume(user, company_profile, application_id):
    app = Application.query.get(application_id)
    if not app:
        return jsonify({'error': 'Application not found'}), 404
    drive = PlacementDrive.query.get(app.drive_id)
    if not drive or drive.company_id != company_profile.id:
        return jsonify({'error': 'Access denied'}), 403

    from models.model import StudentProfile
    student = StudentProfile.query.get(app.student_id)
    filename = student.resume_path if student else None
    upload_dir = os.path.join(current_app.root_path, 'uploads', 'resumes')
    if not filename or os.path.basename(filename) != filename or not os.path.isfile(os.path.join(upload_dir, filename)):
        return jsonify({'error': 'Resume not found'}), 404
    return send_from_directory(upload_dir, filename, as_attachment=True, download_name='resume.pdf')

@company_bp.route('/api/company/applications/<int:application_id>/status', methods=['PUT'])
@company_required
def update_application_status(user, company_profile, application_id):
    app = Application.query.get(application_id)
    if not app:
        return jsonify({'error': 'Application not found'}), 404
    
    drive = PlacementDrive.query.get(app.drive_id)
    if not drive or drive.company_id != company_profile.id:
        return jsonify({'error': 'Access denied'}), 403
    
    data = request.get_json()
    
    new_status = data.get('status')
    if new_status:
        app.status = ApplicationStatus(new_status)
    
    app.remarks = data.get('remarks', app.remarks)
    
    db.session.commit()
    
    return jsonify({'message': 'Application status updated successfully'})

@company_bp.route('/api/company/dashboard-stats', methods=['GET'])
@company_required
def get_company_dashboard_stats(user, company_profile):
    total_drives = PlacementDrive.query.filter_by(company_id=company_profile.id).count()
    
    drive_ids = [d.id for d in PlacementDrive.query.filter_by(company_id=company_profile.id).all()]
    total_applications = Application.query.filter(Application.drive_id.in_(drive_ids)).count()
    
    selected_count = Application.query.filter(
        Application.drive_id.in_(drive_ids),
        Application.status == ApplicationStatus.SELECTED
    ).count()
    
    return jsonify({
        'total_drives': total_drives,
        'total_applications': total_applications,
        'selected_count': selected_count
    })

@company_bp.route('/api/company/students/<int:student_id>/profile', methods=['GET'])
@company_required
def get_student_profile(user, company_profile, student_id):
    import json
    from models.model import StudentProfile
    
    student_profile = StudentProfile.query.get(student_id)
    if not student_profile:
        return jsonify({'error': 'Student profile not found'}), 404

    has_application = db.session.query(Application.id).join(PlacementDrive).filter(
        Application.student_id == student_id,
        PlacementDrive.company_id == company_profile.id
    ).first()
    if not has_application:
        return jsonify({'error': 'Access denied'}), 403
    
    user_obj = User.query.get(student_profile.user_id)
    
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
        'resume_available': bool(student_profile.resume_path),
        'email': user_obj.email if user_obj else None,
        'education': json.loads(student_profile.education) if student_profile.education else [],
        'skills': json.loads(student_profile.skills) if student_profile.skills else [],
        'experience': json.loads(student_profile.experience) if student_profile.experience else []
    })
