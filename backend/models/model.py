from datetime import datetime
import os
from enum import Enum
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class UserRole(Enum):
    #User roles in the placement portal
    ADMIN = "admin"
    COMPANY = "company"
    STUDENT = "student"

class ApplicationStatus(Enum):
    #Application status for student applications
    PENDING = "pending"
    REVIEWED = "reviewed"
    INTERVIEWED = "interviewed"
    WAITLIST = "waitlist"
    REJECTED = "rejected"
    SELECTED = "selected"
    PLACED = "placed"

class DriveStatus(Enum):
    #Placement drive status
    PENDING = "pending"
    APPROVED = "approved"
    ONGOING = "ongoing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class User(db.Model):
   #Base Users table
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(UserRole), nullable=False, default=UserRole.STUDENT)
    is_active = db.Column(db.Boolean, default=True)
    is_blacklisted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    #Relationships
    company_profile = db.relationship('CompanyProfile', backref='user', uselist=False, lazy=True)
    student_profile = db.relationship('StudentProfile', backref='user', uselist=False, lazy=True)

    def set_password(self, password):
        #Hash and set user password
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        #Check if provided password matches stored hash
        return check_password_hash(self.password_hash, password)

class CompanyProfile(db.Model):
    #CompanyProfiles
    __tablename__ = 'company_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    company_name = db.Column(db.String(200))
    industry = db.Column(db.String(100))
    description = db.Column(db.Text)
    website = db.Column(db.String(200))
    location = db.Column(db.String(200))
    contact_person = db.Column(db.String(100))
    contact_phone = db.Column(db.String(20))
    contact_email = db.Column(db.String(120))
    is_approved = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    drives = db.relationship('PlacementDrive', backref='company', lazy=True)

class StudentProfile(db.Model):
   #Student profile information

    __tablename__ = 'student_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    first_name = db.Column(db.String(50))
    last_name = db.Column(db.String(50))
    roll_number = db.Column(db.String(20), unique=True)
    department = db.Column(db.String(100))
    semester = db.Column(db.Integer)
    cgpa = db.Column(db.Float)
    graduation_year = db.Column(db.Integer)
    resume_path = db.Column(db.String(500))
    phone = db.Column(db.String(20))
    education = db.Column(db.Text)  # JSON string of education history
    skills = db.Column(db.Text)  # JSON string of skills
    experience = db.Column(db.Text)  # JSON string of work experience
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    applications = db.relationship('Application', backref='student', lazy=True)

class PlacementDrive(db.Model):
    #Placement drive created by companies for student recruitment
    
    __tablename__ = 'placement_drives'
    
    id = db.Column(db.Integer, primary_key=True)
    drive_code = db.Column(db.String(20), unique=True, nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('company_profiles.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    job_title = db.Column(db.String(100), nullable=False)
    salary = db.Column(db.String(50))
    location = db.Column(db.String(200))
    eligibility_criteria = db.Column(db.Text)
    min_cgpa = db.Column(db.Float, default=0.0)
    eligible_departments = db.Column(db.Text)  # JSON string of departments
    application_deadline = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.Enum(DriveStatus), default=DriveStatus.PENDING)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    applications = db.relationship('Application', backref='drive', lazy=True)

class Application(db.Model):
    #Student applications for placement drives

    __tablename__ = 'applications'
    
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student_profiles.id'), nullable=False)
    drive_id = db.Column(db.Integer, db.ForeignKey('placement_drives.id'), nullable=False)
    status = db.Column(db.Enum(ApplicationStatus), default=ApplicationStatus.PENDING)
    applied_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    remarks = db.Column(db.Text)
    interview_scheduled = db.Column(db.DateTime)
    interview_feedback = db.Column(db.Text)
    offer_letter_path = db.Column(db.String(500))
    offer_status = db.Column(db.String(20))  # 'pending', 'accepted', 'rejected'
