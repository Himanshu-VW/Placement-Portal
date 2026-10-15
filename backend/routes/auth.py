from flask import Blueprint, request, jsonify
from models.model import db, User, UserRole, CompanyProfile, StudentProfile
from datetime import datetime, timedelta
import jwt

auth_bp = Blueprint('auth', __name__)

def generate_token(user_id, role):
    payload = {
        'user_id': user_id,
        'role': role.value,
        'exp': datetime.utcnow() + timedelta(hours=24)
    }
    token = jwt.encode(payload, 'your-secret-key-change-in-production', algorithm='HS256')
    return token

@auth_bp.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    role = data.get('role', 'student')
    
    if not username or not password or not email:
        return jsonify({'error': 'Missing required fields'}), 400
    
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already exists'}), 400
    
    try:
        if role == 'student':
            user_role = UserRole.STUDENT
        elif role == 'company':
            user_role = UserRole.COMPANY
        else:
            return jsonify({'error': 'Invalid role'}), 400
        
        user = User(
            username=username,
            email=email,
            role=user_role,
            is_active=True
        )
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        # Create company profile for company users
        if user_role == UserRole.COMPANY:
            company_profile = CompanyProfile(
                user_id=user.id,
                company_name=username,  # Using username as company name initially
                is_approved=False  # Requires admin approval
            )
            db.session.add(company_profile)
            db.session.commit()
            
            return jsonify({
                'message': 'Company registration successful. Please wait for admin approval before logging in.',
                'requires_approval': True
            }), 201
        
        # Create student profile for student users
        if user_role == UserRole.STUDENT:
            student_profile = StudentProfile(
                user_id=user.id,
                roll_number=username,  # Using username as roll number initially
                department='General',
                semester=1,
                cgpa=0.0,
                graduation_year=datetime.utcnow().year + 1
            )
            db.session.add(student_profile)
            db.session.commit()
        
        # Students can login immediately
        token = generate_token(user.id, user_role)
        
        return jsonify({
            'message': 'Registration successful',
            'token': token,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': user.role.value
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@auth_bp.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Missing username or password'}), 400
    
    user = User.query.filter_by(username=username).first()
    
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    if not user.is_active:
        return jsonify({'error': 'Account is inactive'}), 401
    
    if user.is_blacklisted:
        return jsonify({'error': 'Account is blacklisted'}), 401
    
    if user.role == UserRole.COMPANY:
        company_profile = CompanyProfile.query.filter_by(user_id=user.id).first()
        if not company_profile:
            return jsonify({'error': 'Company profile not found'}), 401
        if not company_profile.is_approved:
            return jsonify({'error': 'Company account is not approved by admin'}), 401
    
    token = generate_token(user.id, user.role)
    
    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'role': user.role.value
        }
    }), 200

@auth_bp.route('/api/verify-token', methods=['POST'])
def verify_token():
    token = request.headers.get('Authorization')
    
    if not token:
        return jsonify({'error': 'Token missing'}), 401
    
    try:
        if token.startswith('Bearer '):
            token = token[7:]
        
        payload = jwt.decode(token, 'your-secret-key-change-in-production', algorithms=['HS256'])
        
        user = User.query.get(payload['user_id'])
        
        if not user or not user.is_active:
            return jsonify({'error': 'Invalid token'}), 401
        
        return jsonify({
            'valid': True,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': user.role.value
            }
        }), 200
        
    except jwt.ExpiredSignatureError:
        return jsonify({'error': 'Token expired'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'error': 'Invalid token'}), 401
