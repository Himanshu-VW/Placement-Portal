const CompanyDashboard = {
    props: ['token', 'user'],
    emits: ['logout'],
    data() {
        return {
            stats: {
                total_drives: 0,
                total_applications: 0,
                selected_count: 0
            },
            drives: [],
            applications: [],
            currentSection: 'dashboard',
            selectedDrive: null,
            showCreateDriveModal: false,
            companyProfile: {
                company_name: '',
                industry: '',
                description: '',
                website: '',
                location: '',
                contact_person: '',
                contact_phone: '',
                contact_email: ''
            },
            profileSaving: false,
            profileMessage: '',
            driveForm: {
                title: '',
                job_title: '',
                description: '',
                salary: '',
                location: '',
                eligibility_criteria: '',
                min_cgpa: 0.0,
                eligible_departments: '',
                application_deadline: ''
            },
            error: '',
            selectedStudentProfile: null,
            showStudentProfileModal: false
        }
    },
    methods: {
        async loadStats() {
            try {
                const response = await axios.get('http://localhost:5000/api/company/dashboard-stats', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.stats = response.data;
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        },
        
        async loadDrives() {
            try {
                const response = await axios.get('http://localhost:5000/api/company/drives', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.drives = response.data.drives;
            } catch (error) {
                console.error('Error loading drives:', error);
            }
        },
        
        async createDrive() {
            this.error = '';
            
            try {
                const response = await axios.post('http://localhost:5000/api/company/drives', this.driveForm, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                this.showCreateDriveModal = false;
                this.driveForm = {
                    title: '',
                    job_title: '',
                    description: '',
                    salary: '',
                    location: '',
                    eligibility_criteria: '',
                    min_cgpa: 0.0,
                    eligible_departments: '',
                    application_deadline: ''
                };
                
                this.loadDrives();
                this.loadStats();
            } catch (error) {
                this.error = error.response?.data?.error || 'Failed to create drive';
            }
        },
        
        async updateDriveStatus(driveId, status) {
            try {
                await axios.put(`http://localhost:5000/api/company/drives/${driveId}`, { status }, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadDrives();
            } catch (error) {
                this.error = 'Failed to update drive status';
            }
        },
        
        async deleteDrive(driveId) {
            if (!confirm('Are you sure you want to delete this drive?')) return;
            
            try {
                await axios.delete(`http://localhost:5000/api/company/drives/${driveId}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadDrives();
                this.loadStats();
            } catch (error) {
                this.error = 'Failed to delete drive';
            }
        },
        
        async viewApplications(driveId) {
            this.selectedDrive = this.drives.find(d => d.id === driveId);
            
            try {
                const response = await axios.get(`http://localhost:5000/api/company/drives/${driveId}/applications`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.applications = response.data.applications;
                this.currentSection = 'applications';
            } catch (error) {
                this.error = 'Failed to load applications';
            }
        },
        
        async updateApplicationStatus(applicationId, status, remarks = '') {
            try {
                await axios.put(`http://localhost:5000/api/company/applications/${applicationId}/status`, 
                    { status, remarks },
                    { headers: { 'Authorization': `Bearer ${this.token}` } }
                );
                
                if (this.selectedDrive) {
                    this.viewApplications(this.selectedDrive.id);
                }
            } catch (error) {
                this.error = 'Failed to update application status';
            }
        },
        
        async viewStudentProfile(studentId) {
            try {
                const response = await axios.get(`http://localhost:5000/api/company/students/${studentId}/profile`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.selectedStudentProfile = response.data;
                this.showStudentProfileModal = true;
            } catch (error) {
                this.error = 'Failed to load student profile';
            }
        },

        async loadCompanyProfile() {
            try {
                const response = await axios.get('http://localhost:5000/api/company/profile', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.companyProfile = { ...this.companyProfile, ...response.data };
            } catch (error) {
                this.error = error.response?.data?.error || 'Failed to load company profile';
            }
        },

        async updateCompanyProfile() {
            this.error = '';
            this.profileMessage = '';
            this.profileSaving = true;
            try {
                await axios.put('http://localhost:5000/api/company/profile', this.companyProfile, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.profileMessage = 'Company profile saved successfully.';
            } catch (error) {
                this.error = error.response?.data?.error || 'Failed to save company profile';
            } finally {
                this.profileSaving = false;
            }
        },

        async downloadResume(applicationId, studentName) {
            try {
                const response = await axios.get(`http://localhost:5000/api/company/applications/${applicationId}/resume`, {
                    headers: { 'Authorization': `Bearer ${this.token}` },
                    responseType: 'blob'
                });
                const url = window.URL.createObjectURL(response.data);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${studentName || 'student'}-resume.pdf`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } catch (error) {
                this.error = error.response?.data?.error || 'Could not download the resume';
            }
        },
        
        setSection(section) {
            this.currentSection = section;
            if (section === 'dashboard') {
                this.loadStats();
                this.loadDrives();
            }
            if (section === 'profile') this.loadCompanyProfile();
        }
    },
    mounted() {
        this.loadStats();
        this.loadDrives();
        this.loadCompanyProfile();
    },
    template: `
        <div class="dashboard-container">
            <div class="welcome-header d-flex justify-content-between align-items-center">
                <div>
                    <h2>Welcome {{ user?.username }}</h2>
                    <p>Company Dashboard</p>
                </div>
                <button @click="$emit('logout')" class="btn btn-light">Logout</button>
            </div>
            
            <div v-if="error" class="alert alert-danger">{{ error }}</div>
            
            <ul class="nav nav-tabs mb-4">
                <li class="nav-item">
                    <a class="nav-link" :class="{active: currentSection === 'dashboard'}" href="#" @click.prevent="setSection('dashboard')">Dashboard</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: currentSection === 'applications'}" href="#" @click.prevent="setSection('applications')">Applications</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: currentSection === 'profile'}" href="#" @click.prevent="setSection('profile')">Company Profile</a>
                </li>
            </ul>
            
            <div v-if="currentSection === 'dashboard'">
                <div class="row mb-4">
                    <div class="col-md-4">
                        <div class="card text-center">
                            <div class="card-body">
                                <h3 class="card-title">{{ stats.total_drives }}</h3>
                                <p class="card-text">Total Drives</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card text-center">
                            <div class="card-body">
                                <h3 class="card-title">{{ stats.total_applications }}</h3>
                                <p class="card-text">Total Applications</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card text-center">
                            <div class="card-body">
                                <h3 class="card-title">{{ stats.selected_count }}</h3>
                                <p class="card-text">Selected Candidates</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4>Placement Drives</h4>
                    <button @click="showCreateDriveModal = true" class="btn btn-primary">Create New Drive</button>
                </div>
                
                <div v-if="drives.length === 0" class="alert alert-info">No drives created yet</div>
                <div v-else class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Drive Code</th>
                                <th>Title</th>
                                <th>Job Title</th>
                                <th>Status</th>
                                <th>Applications</th>
                                <th>Deadline</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="drive in drives" :key="drive.id">
                                <td>{{ drive.drive_code }}</td>
                                <td>{{ drive.title }}</td>
                                <td>{{ drive.job_title }}</td>
                                <td>
                                    <span :class="{
                                        'badge': true,
                                        'bg-success': drive.status === 'approved',
                                        'bg-warning': drive.status === 'pending',
                                        'bg-info': drive.status === 'ongoing',
                                        'bg-secondary': drive.status === 'completed'
                                    }">{{ drive.status === 'pending' ? 'Waiting for Admin Approval' : drive.status }}</span>
                                </td>
                                <td>{{ drive.applications_count }}</td>
                                <td>{{ new Date(drive.application_deadline).toLocaleDateString() }}</td>
                                <td>
                                    <button @click="viewApplications(drive.id)" class="btn btn-sm btn-info me-1">View Applications</button>
                                    <button v-if="drive.status === 'approved'" @click="updateDriveStatus(drive.id, 'ongoing')" class="btn btn-sm btn-success me-1">Activate</button>
                                    <button v-if="drive.status === 'ongoing'" @click="updateDriveStatus(drive.id, 'completed')" class="btn btn-sm btn-secondary me-1">Close</button>
                                    <button @click="deleteDrive(drive.id)" class="btn btn-sm btn-danger">Delete</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div v-if="currentSection === 'profile'">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <h4 class="mb-1">Company Profile</h4>
                        <p class="text-muted mb-0">Keep these details current for students and administrators.</p>
                    </div>
                    <span class="badge" :class="companyProfile.is_approved ? 'bg-success' : 'bg-warning'">
                        {{ companyProfile.is_approved ? 'Approved' : 'Pending approval' }}
                    </span>
                </div>
                <div class="card">
                    <div class="card-body">
                        <div v-if="profileMessage" class="alert alert-success">{{ profileMessage }}</div>
                        <form @submit.prevent="updateCompanyProfile">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Company Name</label>
                                    <input v-model="companyProfile.company_name" type="text" class="form-control" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Industry</label>
                                    <input v-model="companyProfile.industry" type="text" class="form-control" placeholder="Technology, Finance, Healthcare…">
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Company Description</label>
                                <textarea v-model="companyProfile.description" class="form-control" rows="4" placeholder="Tell students about your company"></textarea>
                            </div>
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Website</label>
                                    <input v-model="companyProfile.website" type="url" class="form-control" placeholder="https://example.com">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Location</label>
                                    <input v-model="companyProfile.location" type="text" class="form-control" placeholder="City, State">
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Contact Person</label>
                                    <input v-model="companyProfile.contact_person" type="text" class="form-control">
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Contact Phone</label>
                                    <input v-model="companyProfile.contact_phone" type="tel" class="form-control">
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Contact Email</label>
                                    <input v-model="companyProfile.contact_email" type="email" class="form-control">
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary" :disabled="profileSaving">
                                {{ profileSaving ? 'Saving…' : 'Save Profile' }}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
            
            <div v-if="currentSection === 'applications'">
                <div v-if="!selectedDrive" class="alert alert-info">Select a drive to view applications</div>
                <div v-else>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h4>Applications for {{ selectedDrive.title }}</h4>
                        <button @click="setSection('dashboard')" class="btn btn-secondary">Back to Drives</button>
                    </div>
                    
                    <div v-if="applications.length === 0" class="alert alert-info">No applications received yet</div>
                    <div v-else class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
                                    <th>Student Name</th>
                                    <th>Roll Number</th>
                                    <th>Email</th>
                                    <th>Department</th>
                                    <th>CGPA</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="app in applications" :key="app.id">
                                    <td>{{ app.student_name }}</td>
                                    <td>{{ app.student_roll }}</td>
                                    <td>{{ app.student_email }}</td>
                                    <td>{{ app.student_department }}</td>
                                    <td>{{ app.student_cgpa }}</td>
                                    <td>
                                        <span :class="{
                                            'badge': true,
                                            'bg-primary': app.status === 'pending',
                                            'bg-info': app.status === 'reviewed',
                                            'bg-warning': app.status === 'interviewed',
                                            'bg-secondary': app.status === 'waitlist',
                                            'bg-danger': app.status === 'rejected',
                                            'bg-success': app.status === 'selected'
                                        }">{{ app.status }}</span>
                                    </td>
                                    <td>
                                        <button @click="viewStudentProfile(app.student_id)" class="btn btn-sm btn-info me-1">View Profile</button>
                                        <button v-if="app.resume_available" @click="downloadResume(app.id, app.student_name)" class="btn btn-sm btn-secondary me-1">Resume</button>
                                        <select @change="updateApplicationStatus(app.id, $event.target.value)" class="form-select form-select-sm">
                                            <option value="">Select Action</option>
                                            <option value="reviewed">Mark as Reviewed</option>
                                            <option value="interviewed">Mark as Interviewed</option>
                                            <option value="waitlist">Add to Waitlist</option>
                                            <option value="selected">Select</option>
                                            <option value="placed">Mark as Placed</option>
                                            <option value="rejected">Reject</option>
                                        </select>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Create Drive Modal -->
            <div v-if="showCreateDriveModal" class="modal" style="display: block;">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Create New Drive</h5>
                            <button type="button" @click="showCreateDriveModal = false" class="btn-close" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <form @submit.prevent="createDrive">
                                <div class="mb-3">
                                    <label class="form-label">Drive Title <span class="text-danger">*</span></label>
                                    <input type="text" v-model="driveForm.title" class="form-control" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Job Title <span class="text-danger">*</span></label>
                                    <input type="text" v-model="driveForm.job_title" class="form-control" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Job Description <span class="text-danger">*</span></label>
                                    <textarea v-model="driveForm.description" class="form-control" rows="3" required></textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Salary</label>
                                    <input type="text" v-model="driveForm.salary" class="form-control">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Location <span class="text-danger">*</span></label>
                                    <input type="text" v-model="driveForm.location" class="form-control" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Eligibility Criteria</label>
                                    <textarea v-model="driveForm.eligibility_criteria" class="form-control" rows="2"></textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Minimum CGPA</label>
                                    <input type="number" step="0.1" v-model="driveForm.min_cgpa" class="form-control" min="0" max="10">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Eligible Departments (comma separated)</label>
                                    <input type="text" v-model="driveForm.eligible_departments" class="form-control" placeholder="CSE, ECE, ME">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Application Deadline <span class="text-danger">*</span></label>
                                    <input type="datetime-local" v-model="driveForm.application_deadline" class="form-control" required>
                                </div>
                                <button type="submit" class="btn btn-primary">Create Drive</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Student Profile Modal -->
            <div v-if="showStudentProfileModal" class="modal" style="display: block;">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Student Profile</h5>
                            <button type="button" @click="showStudentProfileModal = false" class="btn-close" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" v-if="selectedStudentProfile">
                            <div class="row">
                                <div class="col-md-6">
                                    <p><strong>Name:</strong> {{ selectedStudentProfile.first_name }} {{ selectedStudentProfile.last_name }}</p>
                                    <p><strong>Roll Number:</strong> {{ selectedStudentProfile.roll_number }}</p>
                                    <p><strong>Department:</strong> {{ selectedStudentProfile.department }}</p>
                                    <p><strong>Semester:</strong> {{ selectedStudentProfile.semester }}</p>
                                    <p><strong>CGPA:</strong> {{ selectedStudentProfile.cgpa }}</p>
                                </div>
                                <div class="col-md-6">
                                    <p><strong>Graduation Year:</strong> {{ selectedStudentProfile.graduation_year }}</p>
                                    <p><strong>Phone:</strong> {{ selectedStudentProfile.phone }}</p>
                                    <p><strong>Email:</strong> {{ selectedStudentProfile.email }}</p>
                                </div>
                            </div>
                            <div class="mt-3">
                                <h5>Education</h5>
                                <ul>
                                    <li v-for="(edu, index) in selectedStudentProfile.education" :key="index">
                                        {{ edu.degree }} from {{ edu.institution }} ({{ edu.year }})
                                    </li>
                                </ul>
                            </div>
                            <div class="mt-3">
                                <h5>Skills</h5>
                                <div>
                                    <span v-for="(skill, index) in selectedStudentProfile.skills" :key="index" class="badge bg-secondary me-1">{{ skill }}</span>
                                </div>
                            </div>
                            <div class="mt-3">
                                <h5>Experience</h5>
                                <ul>
                                    <li v-for="(exp, index) in selectedStudentProfile.experience" :key="index">
                                        {{ exp.position }} at {{ exp.company }} ({{ exp.duration }})
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
