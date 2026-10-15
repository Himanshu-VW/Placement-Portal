const StudentDashboard = {
    props: ['token', 'user'],
    emits: ['logout'],
    data() {
        return {
            currentSection: 'dashboard',
            drives: [],
            applications: [],
            profile: null,
            showProfileModal: false,
            profileForm: {
                first_name: '',
                last_name: '',
                roll_number: '',
                department: '',
                semester: '',
                cgpa: '',
                graduation_year: '',
                phone: '',
                education: [],
                skills: [],
                experience: []
            },
            searchQuery: '',
            searchCompany: '',
            searchPosition: '',
            error: '',
            exportTaskId: null,
            exportStatus: '',
            exportDownloadUrl: '',
            exportPollingId: null,
            resumeUploading: false
        }
    },
    methods: {
        async loadDrives() {
            try {
                let url = 'http://localhost:5000/api/student/drives';
                const params = new URLSearchParams();
                if (this.searchQuery) params.append('q', this.searchQuery);
                if (this.searchCompany) params.append('company', this.searchCompany);
                if (this.searchPosition) params.append('position', this.searchPosition);
                if (params.toString()) url += '?' + params.toString();
                
                const response = await axios.get(url, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.drives = response.data.drives;
            } catch (error) {
                console.error('Error loading drives:', error);
            }
        },
        
        async loadApplications() {
            try {
                const response = await axios.get('http://localhost:5000/api/student/applications', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.applications = response.data.applications;
            } catch (error) {
                console.error('Error loading applications:', error);
            }
        },
        
        async loadProfile() {
            try {
                const response = await axios.get('http://localhost:5000/api/student/profile', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.profile = response.data;
            } catch (error) {
                console.error('Error loading profile:', error);
            }
        },
        
        async applyForDrive(driveId) {
            if (!this.profile || !this.profile.has_resume) {
                this.error = 'Upload your resume in Profile before applying to a drive.';
                this.setSection('profile');
                return;
            }
            try {
                await axios.post('http://localhost:5000/api/student/applications', { drive_id: driveId }, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadApplications();
                this.loadDrives();
            } catch (error) {
                this.error = error.response?.data?.error || 'Failed to apply for drive';
            }
        },

        async exportApplications() {
            this.error = '';
            this.exportDownloadUrl = '';
            try {
                const response = await axios.post('http://localhost:5000/api/student/application-export', {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.exportTaskId = response.data.task_id;
                this.exportStatus = response.data.message;
                this.checkExportStatus();
                this.exportPollingId = window.setInterval(this.checkExportStatus, 2500);
            } catch (error) {
                this.error = error.response?.data?.error || 'Could not start the CSV export';
            }
        },

        async checkExportStatus() {
            if (!this.exportTaskId) return;
            try {
                const response = await axios.get(`http://localhost:5000/api/student/application-export/${this.exportTaskId}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const data = response.data;
                if (data.status === 'SUCCESS') {
                    this.exportStatus = `${data.message} (${data.row_count} application(s)).`;
                    this.exportDownloadUrl = `http://localhost:5000${data.download_url}`;
                    window.clearInterval(this.exportPollingId);
                    this.exportPollingId = null;
                } else if (data.status === 'FAILURE') {
                    this.exportStatus = data.message;
                    window.clearInterval(this.exportPollingId);
                    this.exportPollingId = null;
                } else {
                    this.exportStatus = 'Preparing your CSV export…';
                }
            } catch (error) {
                this.error = 'Could not check the export status';
                window.clearInterval(this.exportPollingId);
                this.exportPollingId = null;
            }
        },

        async downloadExport() {
            if (!this.exportDownloadUrl) return;
            try {
                const response = await axios.get(this.exportDownloadUrl, {
                    headers: { 'Authorization': `Bearer ${this.token}` },
                    responseType: 'blob'
                });
                const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = 'application-history.csv';
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            } catch (error) {
                this.error = error.response?.data?.error || 'Could not download the CSV export';
            }
        },
        
        async updateProfile() {
            try {
                const dataToSend = {
                    first_name: this.profileForm.first_name,
                    last_name: this.profileForm.last_name,
                    roll_number: this.profileForm.roll_number,
                    department: this.profileForm.department,
                    semester: this.profileForm.semester,
                    cgpa: this.profileForm.cgpa,
                    graduation_year: this.profileForm.graduation_year,
                    phone: this.profileForm.phone,
                    education: this.profileForm.education,
                    skills: this.profileForm.skills,
                    experience: this.profileForm.experience
                };
                
                await axios.put('http://localhost:5000/api/student/profile', dataToSend, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.showProfileModal = false;
                this.loadProfile();
            } catch (error) {
                this.error = error.response?.data?.error || 'Failed to update profile';
                console.error('Profile update error:', error);
            }
        },

        async uploadResume(event) {
            const file = event.target.files[0];
            if (!file) return;
            this.error = '';
            if (!file.name.toLowerCase().endsWith('.pdf')) {
                this.error = 'Please choose a PDF resume.';
                event.target.value = '';
                return;
            }
            this.resumeUploading = true;
            try {
                const formData = new FormData();
                formData.append('resume', file);
                await axios.post('http://localhost:5000/api/student/profile/resume', formData, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                await this.loadProfile();
            } catch (error) {
                this.error = error.response?.data?.error || 'Could not upload your resume';
            } finally {
                this.resumeUploading = false;
                event.target.value = '';
            }
        },
        
        openProfileModal() {
            if (this.profile) {
                this.profileForm = { ...this.profile };
            }
            this.showProfileModal = true;
        },
        
        addEducation() {
            this.profileForm.education.push({ degree: '', institution: '', year: '' });
        },
        
        removeEducation(index) {
            this.profileForm.education.splice(index, 1);
        },
        
        addSkill() {
            this.profileForm.skills.push('');
        },
        
        removeSkill(index) {
            this.profileForm.skills.splice(index, 1);
        },
        
        addExperience() {
            this.profileForm.experience.push({ company: '', position: '', duration: '' });
        },
        
        removeExperience(index) {
            this.profileForm.experience.splice(index, 1);
        },
        
        setSection(section) {
            this.currentSection = section;
            if (section === 'dashboard') this.loadDrives();
            if (section === 'applications') this.loadApplications();
            if (section === 'profile') this.loadProfile();
        }
    },
    mounted() {
        this.loadDrives();
        this.loadApplications();
        this.loadProfile();
    },
    beforeUnmount() {
        if (this.exportPollingId) window.clearInterval(this.exportPollingId);
    },
    template: `
        <div class="dashboard-container">
            <div class="welcome-header d-flex justify-content-between align-items-center">
                <div>
                    <h2>Welcome {{ user?.username }}</h2>
                    <p>Student Dashboard</p>
                </div>
                <div>
                    <button @click="$emit('logout')" class="btn btn-light">Logout</button>
                </div>
            </div>
            
            <div v-if="error" class="alert alert-danger">{{ error }}</div>
            
            <ul class="nav nav-tabs mb-4">
                <li class="nav-item">
                    <a class="nav-link" :class="{active: currentSection === 'dashboard'}" href="#" @click.prevent="setSection('dashboard')">Available Drives</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: currentSection === 'applications'}" href="#" @click.prevent="setSection('applications')">My Applications</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: currentSection === 'profile'}" href="#" @click.prevent="setSection('profile')">Profile</a>
                </li>
            </ul>
            
            <div v-if="currentSection === 'dashboard'">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4>Available Placement Drives</h4>
                </div>
                
                <div class="row mb-3">
                    <div class="col-md-3">
                        <input type="text" v-model="searchQuery" @keyup.enter="loadDrives" class="form-control" placeholder="Search by keyword...">
                    </div>
                    <div class="col-md-3">
                        <input type="text" v-model="searchCompany" @keyup.enter="loadDrives" class="form-control" placeholder="Search by company...">
                    </div>
                    <div class="col-md-3">
                        <input type="text" v-model="searchPosition" @keyup.enter="loadDrives" class="form-control" placeholder="Search by position...">
                    </div>
                    <div class="col-md-3">
                        <button @click="loadDrives" class="btn btn-primary w-100">Search</button>
                    </div>
                </div>
                
                <div v-if="drives.length === 0" class="alert alert-info">No drives available at the moment</div>
                <div v-else class="row">
                    <div v-for="drive in drives" :key="drive.id" class="col-md-6 mb-3">
                        <div class="card">
                            <div class="card-body">
                                <h5 class="card-title">{{ drive.title }}</h5>
                                <h6 class="card-subtitle mb-2 text-muted">{{ drive.company_name }}</h6>
                                <p class="card-text"><strong>Job Title:</strong> {{ drive.job_title }}</p>
                                <p class="card-text"><strong>Salary:</strong> {{ drive.salary }}</p>
                                <p class="card-text"><strong>Location:</strong> {{ drive.location }}</p>
                                <p class="card-text"><strong>Deadline:</strong> {{ new Date(drive.application_deadline).toLocaleDateString() }}</p>
                                <p class="card-text"><small>{{ drive.description }}</small></p>
                                <button @click="applyForDrive(drive.id)" class="btn btn-primary">Apply</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div v-if="currentSection === 'applications'">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="mb-0">My Applications</h4>
                    <button @click="exportApplications" class="btn btn-success" :disabled="exportPollingId">
                        {{ exportPollingId ? 'Preparing CSV…' : 'Export as CSV' }}
                    </button>
                </div>
                <div v-if="exportStatus" class="alert" :class="exportDownloadUrl ? 'alert-success' : 'alert-info'">
                    {{ exportStatus }}
                    <button v-if="exportDownloadUrl" @click="downloadExport" class="btn btn-sm btn-outline-success ms-2">Download CSV</button>
                </div>
                <div v-if="applications.length === 0" class="alert alert-info">You haven't applied to any drives yet</div>
                <div v-else class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Company</th>
                                <th>Drive Title</th>
                                <th>Job Title</th>
                                <th>Status</th>
                                <th>Interview</th>
                                <th>Feedback</th>
                                <th>Offer</th>
                                <th>Applied Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="app in applications" :key="app.id">
                                <td>{{ app.company_name }}</td>
                                <td>{{ app.drive_title }}</td>
                                <td>{{ app.job_title }}</td>
                                <td>
                                    <span :class="{
                                        'badge': true,
                                        'bg-primary': app.status === 'pending',
                                        'bg-info': app.status === 'reviewed',
                                        'bg-warning': app.status === 'interviewed',
                                        'bg-secondary': app.status === 'waitlist',
                                        'bg-danger': app.status === 'rejected',
                                        'bg-success': app.status === 'selected',
                                        'bg-dark': app.status === 'placed'
                                    }">{{ app.status }}</span>
                                </td>
                                <td>{{ app.interview_scheduled ? new Date(app.interview_scheduled).toLocaleString() : 'Not scheduled' }}</td>
                                <td>{{ app.interview_feedback || '-' }}</td>
                                <td>
                                    <span v-if="app.offer_letter_path" class="badge bg-success">
                                        <a :href="app.offer_letter_path" target="_blank" class="text-white">Download</a>
                                    </span>
                                    <span v-else-if="app.offer_status" class="badge bg-info">{{ app.offer_status }}</span>
                                    <span v-else>-</span>
                                </td>
                                <td>{{ new Date(app.applied_at).toLocaleDateString() }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div v-if="currentSection === 'profile'">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="mb-0">My Profile</h4>
                    <button @click="openProfileModal" class="btn btn-primary">Edit Profile</button>
                </div>
                <div class="card mb-4">
                    <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                        <div>
                            <h5 class="mb-1">Resume</h5>
                            <p class="text-muted mb-0">{{ profile?.has_resume ? 'A PDF resume is uploaded and ready for employers.' : 'Upload a PDF resume before you can apply to a drive.' }}</p>
                        </div>
                        <label class="btn btn-primary mb-0" :class="{ disabled: resumeUploading }">
                            {{ resumeUploading ? 'Uploading…' : (profile?.has_resume ? 'Replace Resume' : 'Upload Resume') }}
                            <input type="file" accept="application/pdf,.pdf" class="d-none" @change="uploadResume" :disabled="resumeUploading">
                        </label>
                    </div>
                </div>
                <div v-if="profile" class="card">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Name:</strong> {{ profile.first_name }} {{ profile.last_name }}</p>
                                <p><strong>Roll Number:</strong> {{ profile.roll_number }}</p>
                                <p><strong>Department:</strong> {{ profile.department }}</p>
                                <p><strong>Semester:</strong> {{ profile.semester }}</p>
                                <p><strong>CGPA:</strong> {{ profile.cgpa }}</p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Graduation Year:</strong> {{ profile.graduation_year }}</p>
                                <p><strong>Phone:</strong> {{ profile.phone }}</p>
                                <p><strong>Email:</strong> {{ profile.email }}</p>
                            </div>
                        </div>
                        <div class="mt-3">
                            <h5>Education</h5>
                            <ul>
                                <li v-for="(edu, index) in profile.education" :key="index">
                                    {{ edu.degree }} from {{ edu.institution }} ({{ edu.year }})
                                </li>
                            </ul>
                        </div>
                        <div class="mt-3">
                            <h5>Skills</h5>
                            <div>
                                <span v-for="(skill, index) in profile.skills" :key="index" class="badge bg-secondary me-1">{{ skill }}</span>
                            </div>
                        </div>
                        <div class="mt-3">
                            <h5>Experience</h5>
                            <ul>
                                <li v-for="(exp, index) in profile.experience" :key="index">
                                    {{ exp.position }} at {{ exp.company }} ({{ exp.duration }})
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Profile Edit Modal -->
            <div v-if="showProfileModal" class="modal" style="display: block;">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit Profile</h5>
                            <button type="button" @click="showProfileModal = false" class="btn-close" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <form @submit.prevent="updateProfile">
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">First Name</label>
                                        <input type="text" v-model="profileForm.first_name" class="form-control" required>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Last Name</label>
                                        <input type="text" v-model="profileForm.last_name" class="form-control" required>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Roll Number</label>
                                        <input type="text" v-model="profileForm.roll_number" class="form-control" required>
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Department</label>
                                        <input type="text" v-model="profileForm.department" class="form-control" required>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-4 mb-3">
                                        <label class="form-label">Semester</label>
                                        <input type="number" v-model="profileForm.semester" class="form-control" required>
                                    </div>
                                    <div class="col-md-4 mb-3">
                                        <label class="form-label">CGPA</label>
                                        <input type="number" step="0.1" v-model="profileForm.cgpa" class="form-control" required>
                                    </div>
                                    <div class="col-md-4 mb-3">
                                        <label class="form-label">Graduation Year</label>
                                        <input type="number" v-model="profileForm.graduation_year" class="form-control" required>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Phone</label>
                                    <input type="text" v-model="profileForm.phone" class="form-control">
                                </div>
                                
                                <h5>Education</h5>
                                <div v-for="(edu, index) in profileForm.education" :key="index" class="row mb-2">
                                    <div class="col-md-4">
                                        <input type="text" v-model="edu.degree" class="form-control" placeholder="Degree">
                                    </div>
                                    <div class="col-md-4">
                                        <input type="text" v-model="edu.institution" class="form-control" placeholder="Institution">
                                    </div>
                                    <div class="col-md-3">
                                        <input type="text" v-model="edu.year" class="form-control" placeholder="Year">
                                    </div>
                                    <div class="col-md-1">
                                        <button type="button" @click="removeEducation(index)" class="btn btn-danger btn-sm">X</button>
                                    </div>
                                </div>
                                <button type="button" @click="addEducation" class="btn btn-sm btn-secondary mb-3">Add Education</button>
                                
                                <h5>Skills</h5>
                                <div v-for="(skill, index) in profileForm.skills" :key="index" class="row mb-2">
                                    <div class="col-md-11">
                                        <input type="text" v-model="profileForm.skills[index]" class="form-control" placeholder="Skill">
                                    </div>
                                    <div class="col-md-1">
                                        <button type="button" @click="removeSkill(index)" class="btn btn-danger btn-sm">X</button>
                                    </div>
                                </div>
                                <button type="button" @click="addSkill" class="btn btn-sm btn-secondary mb-3">Add Skill</button>
                                
                                <h5>Experience</h5>
                                <div v-for="(exp, index) in profileForm.experience" :key="index" class="row mb-2">
                                    <div class="col-md-3">
                                        <input type="text" v-model="exp.company" class="form-control" placeholder="Company">
                                    </div>
                                    <div class="col-md-3">
                                        <input type="text" v-model="exp.position" class="form-control" placeholder="Position">
                                    </div>
                                    <div class="col-md-3">
                                        <input type="text" v-model="exp.duration" class="form-control" placeholder="Duration">
                                    </div>
                                    <div class="col-md-3">
                                        <button type="button" @click="removeExperience(index)" class="btn btn-danger btn-sm">Remove</button>
                                    </div>
                                </div>
                                <button type="button" @click="addExperience" class="btn btn-sm btn-secondary mb-3">Add Experience</button>
                                
                                <button type="submit" class="btn btn-primary">Save Profile</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
