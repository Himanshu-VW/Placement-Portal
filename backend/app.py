from flask import Flask
import os
from models.model import db, User, UserRole
from flask_cors import CORS
from routes.auth import auth_bp
from routes.admin import admin_bp
from routes.company import company_bp
from routes.student import student_bp

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*", "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]}})

basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'database.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = 'your-secret-key-change-in-production'

db.init_app(app)

app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(company_bp)
app.register_blueprint(student_bp)

def init_database(app):
    with app.app_context():
        db.create_all()

        admin_user = User.query.filter_by(role=UserRole.ADMIN).first()
        if not admin_user:
            # Create default admin user
            admin = User(
                username='admin',
                email='vitzzwayne@gmail.com',
                role=UserRole.ADMIN,
                is_active=True
            )
            admin.set_password('admin123')  # Default password - should be changed in production
            db.session.add(admin)
            db.session.commit()
            print("Default admin user created: username=admin, password=admin123")

init_database(app)

@app.route('/')
def home():
    return "Placement Portal Database Initialized!"

if __name__ == '__main__':
    app.run(debug=True)
