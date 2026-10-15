const AdminDashboard = {
    props: ['token'],
    data() {
        return {
            stats: {
                total_students: 0,
                total_companies: 0,
                total_drives: 0,
                total_applications: 0
            },
            companies: [],
            students: [],
            drives: [],
            applications: [],
            searchQuery: '',
            adminSection: 'stats',
            error: '',
            reminderMessage: '',
            reminderSubmitting: false,
            reminderTaskId: null,
            reminderPollingId: null,
            reportMessage: '',
            reportSubmitting: false,
            reportTaskId: null,
            reportPollingId: null,
            selectedStudentProfile: null,
            selectedStudentApplications: null,
            showStudentProfileModal: false,
            showStudentApplicationsModal: false
        }
    },
    computed: {
        pendingCompanies() {
            return this.companies.filter(company => !company.is_approved && !company.is_blacklisted);
        },
        pendingDrives() {
            return this.drives.filter(drive => drive.status === 'pending');
        }
    },
    methods: {
        async loadDashboardStats() {
            try {
                const response = await axios.get('http://localhost:5000/api/admin/dashboard-stats', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.stats = response.data;
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        },

        async triggerMonthlyReport() {
            this.error = '';
            this.reportMessage = '';
            this.reportSubmitting = true;
            try {
                const response = await axios.post('http://localhost:5000/api/admin/monthly-report', {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.reportMessage = response.data.message;
                this.reportTaskId = response.data.task_id;
                this.checkMonthlyReportStatus();
                this.reportPollingId = window.setInterval(this.checkMonthlyReportStatus, 2500);
            } catch (error) {
                this.error = error.response?.data?.error || 'Could not queue the monthly report';
            } finally {
                this.reportSubmitting = false;
            }
        },

        async triggerDeadlineReminders() {
            this.error = '';
            this.reminderMessage = '';
            this.reminderSubmitting = true;
            try {
                const response = await axios.post('http://localhost:5000/api/admin/deadline-reminders', {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.reminderMessage = response.data.message;
                this.reminderTaskId = response.data.task_id;
                this.checkDeadlineReminderStatus();
                this.reminderPollingId = window.setInterval(this.checkDeadlineReminderStatus, 2500);
            } catch (error) {
                this.error = error.response?.data?.error || 'Could not queue deadline reminders';
            } finally {
                this.reminderSubmitting = false;
            }
        },

        async checkDeadlineReminderStatus() {
            if (!this.reminderTaskId) return;
            try {
                const response = await axios.get(`http://localhost:5000/api/admin/deadline-reminders/${this.reminderTaskId}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (response.data.status === 'SUCCESS' || response.data.status === 'FAILURE') {
                    this.reminderMessage = response.data.message;
                    window.clearInterval(this.reminderPollingId);
                    this.reminderPollingId = null;
                }
            } catch (error) {
                this.error = 'Could not check reminder delivery status';
                window.clearInterval(this.reminderPollingId);
                this.reminderPollingId = null;
            }
        },

        async checkMonthlyReportStatus() {
            if (!this.reportTaskId) return;
            try {
                const response = await axios.get(`http://localhost:5000/api/admin/monthly-report/${this.reportTaskId}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (response.data.status === 'SUCCESS' || response.data.status === 'FAILURE') {
                    this.reportMessage = response.data.message;
                    window.clearInterval(this.reportPollingId);
                    this.reportPollingId = null;
                }
            } catch (error) {
                this.error = 'Could not check report delivery status';
                window.clearInterval(this.reportPollingId);
                this.reportPollingId = null;
            }
        },
        
        async loadCompanies() {
            try {
                const response = await axios.get('http://localhost:5000/api/admin/companies', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.companies = response.data.companies;
            } catch (error) {
                console.error('Error loading companies:', error);
            }
        },
        
        async approveCompany(companyId) {
            try {
                await axios.post(`http://localhost:5000/api/admin/companies/${companyId}/approve`, {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadCompanies();
            } catch (error) {
                this.error = 'Failed to approve company';
            }
        },
        
        async loadDrives() {
            try {
                const response = await axios.get('http://localhost:5000/api/admin/drives', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.drives = response.data.drives;
            } catch (error) {
                console.error('Error loading drives:', error);
            }
        },
        
        async approveDrive(driveId) {
            try {
                await axios.post(`http://localhost:5000/api/admin/drives/${driveId}/approve`, {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadDrives();
            } catch (error) {
                this.error = 'Failed to approve drive';
            }
        },
        
        async loadStudents() {
            try {
                const response = await axios.get('http://localhost:5000/api/admin/students', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.students = response.data.students;
            } catch (error) {
                console.error('Error loading students:', error);
            }
        },
        
        async viewStudentProfile(studentId) {
            try {
                const response = await axios.get(`http://localhost:5000/api/admin/students/${studentId}/profile`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.selectedStudentProfile = response.data;
                this.showStudentProfileModal = true;
            } catch (error) {
                this.error = 'Failed to load student profile';
            }
        },
        
        async viewStudentApplications(studentId) {
            try {
                const response = await axios.get(`http://localhost:5000/api/admin/students/${studentId}/applications`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.selectedStudentApplications = response.data.applications;
                this.showStudentApplicationsModal = true;
            } catch (error) {
                this.error = 'Failed to load student applications';
            }
        },
        
        async search() {
            if (!this.searchQuery) return;
            
            try {
                if (this.adminSection === 'companies') {
                    const response = await axios.get(`http://localhost:5000/api/admin/search/companies?q=${this.searchQuery}`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    this.companies = response.data.companies;
                } else if (this.adminSection === 'students') {
                    const response = await axios.get(`http://localhost:5000/api/admin/search/students?q=${this.searchQuery}`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    this.students = response.data.students;
                }
            } catch (error) {
                console.error('Error searching:', error);
            }
        },
        
        async blacklistUser(userId) {
            if (!confirm('Are you sure you want to blacklist this user?')) return;
            
            try {
                await axios.post(`http://localhost:5000/api/admin/users/${userId}/blacklist`, {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadCompanies();
                this.loadStudents();
            } catch (error) {
                this.error = 'Failed to blacklist user';
            }
        },
        
        async unblacklistUser(userId) {
            try {
                await axios.post(`http://localhost:5000/api/admin/users/${userId}/unblacklist`, {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadCompanies();
                this.loadStudents();
            } catch (error) {
                this.error = 'Failed to unblacklist user';
            }
        },
        
        async deactivateUser(userId) {
            if (!confirm('Are you sure you want to deactivate this user?')) return;
            
            try {
                await axios.post(`http://localhost:5000/api/admin/users/${userId}/deactivate`, {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadCompanies();
                this.loadStudents();
            } catch (error) {
                this.error = 'Failed to deactivate user';
            }
        },
        
        async activateUser(userId) {
            try {
                await axios.post(`http://localhost:5000/api/admin/users/${userId}/activate`, {}, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.loadCompanies();
                this.loadStudents();
            } catch (error) {
                this.error = 'Failed to activate user';
            }
        },
        
        async loadApplications() {
            try {
                const response = await axios.get('http://localhost:5000/api/admin/applications', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                this.applications = response.data.applications;
            } catch (error) {
                console.error('Error loading applications:', error);
            }
        },
        
        setAdminSection(section) {
            this.adminSection = section;
            if (section === 'stats') this.loadDashboardStats();
            if (section === 'companies') this.loadCompanies();
            if (section === 'drives') this.loadDrives();
            if (section === 'students') this.loadStudents();
            if (section === 'applications') this.loadApplications();
        }
    },
    mounted() {
        this.loadDashboardStats();
        this.loadCompanies();
        this.loadDrives();
        this.loadStudents();
        this.loadApplications();
    },
    beforeUnmount() {
        if (this.reportPollingId) window.clearInterval(this.reportPollingId);
        if (this.reminderPollingId) window.clearInterval(this.reminderPollingId);
    },
    template: `
        <div class="dashboard-container">
            <div class="welcome-header d-flex justify-content-between align-items-center">
                <div>
                    <h2>Welcome Admin</h2>
                    <p>Manage placement portal activities</p>
                </div>
                <button @click="$emit('logout')" class="btn btn-light">Logout</button>
            </div>
            
            <ul class="nav nav-tabs mb-4">
                <li class="nav-item">
                    <a class="nav-link" :class="{active: adminSection === 'stats'}" href="#" @click.prevent="setAdminSection('stats')">Dashboard</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: adminSection === 'companies'}" href="#" @click.prevent="setAdminSection('companies')">Companies</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: adminSection === 'drives'}" href="#" @click.prevent="setAdminSection('drives')">Drives</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: adminSection === 'students'}" href="#" @click.prevent="setAdminSection('students')">Students</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link" :class="{active: adminSection === 'applications'}" href="#" @click.prevent="setAdminSection('applications')">Applications</a>
                </li>
            </ul>
            
            <div v-if="error" class="alert alert-danger">{{ error }}</div>
            
            <div v-if="adminSection === 'stats'">
                <div class="row">
                    <div class="col-md-3">
                        <div class="card mb-3 text-center">
                            <div class="card-body">
                                <h3 class="card-title">{{ stats.total_students }}</h3>
                                <p class="card-text">Total Students</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card mb-3 text-center">
                            <div class="card-body">
                                <h3 class="card-title">{{ stats.total_companies }}</h3>
                                <p class="card-text">Total Companies</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card mb-3 text-center">
                            <div class="card-body">
                                <h3 class="card-title">{{ stats.total_drives }}</h3>
                                <p class="card-text">Total Drives</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card mb-3 text-center">
                            <div class="card-body">
                                <h3 class="card-title">{{ stats.total_applications }}</h3>
                                <p class="card-text">Total Applications</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-4 mb-3">
                    <div>
                        <h4 class="mb-1">Approval Requests</h4>
                        <p class="text-muted mb-0">Review pending company registrations and placement drives.</p>
                    </div>
                    <span class="badge bg-warning">{{ pendingCompanies.length + pendingDrives.length }} pending</span>
                </div>
                <div class="row mb-4">
                    <div class="col-lg-6 mb-3 mb-lg-0">
                        <div class="card h-100">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h5 class="mb-0">Company Requests</h5>
                                    <span class="badge bg-secondary">{{ pendingCompanies.length }}</span>
                                </div>
                                <div v-if="pendingCompanies.length === 0" class="text-muted">No company approvals are waiting.</div>
                                <div v-else>
                                    <div v-for="company in pendingCompanies" :key="company.id" class="d-flex justify-content-between align-items-center gap-3 py-3 border-bottom">
                                        <div>
                                            <div class="fw-semibold">{{ company.company_name || 'Unnamed company' }}</div>
                                            <small class="text-muted">{{ company.industry || 'Industry not provided' }} · {{ company.email || 'No contact email' }}</small>
                                        </div>
                                        <button @click="approveCompany(company.id)" class="btn btn-sm btn-primary">Approve</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card h-100">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h5 class="mb-0">Drive Requests</h5>
                                    <span class="badge bg-secondary">{{ pendingDrives.length }}</span>
                                </div>
                                <div v-if="pendingDrives.length === 0" class="text-muted">No drive approvals are waiting.</div>
                                <div v-else>
                                    <div v-for="drive in pendingDrives" :key="drive.id" class="d-flex justify-content-between align-items-center gap-3 py-3 border-bottom">
                                        <div>
                                            <div class="fw-semibold">{{ drive.title }}</div>
                                            <small class="text-muted">{{ drive.company_name }} · {{ drive.job_title }}</small>
                                        </div>
                                        <button @click="approveDrive(drive.id)" class="btn btn-sm btn-primary">Approve</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mb-4">
                    <div class="card-body d-flex justify-content-between align-items-center">
                        <div>
                            <h5 class="mb-1">Daily Deadline Reminders</h5>
                            <small class="text-muted">Email active students about approved, unapplied drives closing within the next 7 days.</small>
                        </div>
                        <button @click="triggerDeadlineReminders" class="btn btn-primary" :disabled="reminderSubmitting">
                            {{ reminderSubmitting ? 'Sending…' : 'Send Deadline Reminders Now' }}
                        </button>
                    </div>
                    <div v-if="reminderMessage" class="card-footer" :class="reminderMessage.includes('could not') ? 'text-danger' : 'text-success'">{{ reminderMessage }}</div>
                </div>
                <div class="card mb-4">
                    <div class="card-body d-flex justify-content-between align-items-center">
                        <div>
                            <h5 class="mb-1">Monthly Activity Report</h5>
                            <small class="text-muted">Email a report for the current month up to this moment.</small>
                        </div>
                        <button @click="triggerMonthlyReport" class="btn btn-primary" :disabled="reportSubmitting">
                            {{ reportSubmitting ? 'Generating…' : 'Email Current Report' }}
                        </button>
                    </div>
                    <div v-if="reportMessage" class="card-footer" :class="reportMessage.includes('could not') ? 'text-danger' : 'text-success'">{{ reportMessage }}</div>
                </div>
            </div>
            
            <div v-if="adminSection === 'companies'">
                <div class="mb-3">
                    <input type="text" v-model="searchQuery" @keyup.enter="search" class="form-control" placeholder="Search companies by name or industry...">
                </div>
                <div v-if="companies.length === 0" class="alert alert-info">No companies found</div>
                <div v-else class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Company Name</th>
                                <th>Industry</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="company in companies" :key="company.id">
                                <td>{{ company.company_name }}</td>
                                <td>{{ company.industry }}</td>
                                <td>{{ company.email }}</td>
                                <td>
                                    <span v-if="company.is_approved" class="badge bg-success">Approved</span>
                                    <span v-else class="badge bg-warning">Pending</span>
                                    <span v-if="company.is_blacklisted" class="badge bg-danger">Blacklisted</span>
                                </td>
                                <td>
                                    <button v-if="!company.is_approved" @click="approveCompany(company.id)" class="btn btn-sm btn-success me-1">Approve</button>
                                    <button v-if="!company.is_blacklisted" @click="blacklistUser(company.user_id)" class="btn btn-sm btn-dark">Blacklist</button>
                                    <button v-else @click="unblacklistUser(company.user_id)" class="btn btn-sm btn-secondary">Unblacklist</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div v-if="adminSection === 'drives'">
                <div v-if="drives.length === 0" class="alert alert-info">No drives found</div>
                <div v-else class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Drive Code</th>
                                <th>Title</th>
                                <th>Job Title</th>
                                <th>Company</th>
                                <th>Status</th>
                                <th>Deadline</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="drive in drives" :key="drive.id">
                                <td>{{ drive.drive_code }}</td>
                                <td>{{ drive.title }}</td>
                                <td>{{ drive.job_title }}</td>
                                <td>{{ drive.company_name }}</td>
                                <td>
                                    <span :class="{
                                        'badge': true,
                                        'bg-success': drive.status === 'approved',
                                        'bg-warning': drive.status === 'pending',
                                        'bg-info': drive.status === 'ongoing',
                                        'bg-secondary': drive.status === 'completed'
                                    }">{{ drive.status }}</span>
                                </td>
                                <td>{{ new Date(drive.application_deadline).toLocaleDateString() }}</td>
                                <td>
                                    <button v-if="drive.status === 'pending'" @click="approveDrive(drive.id)" class="btn btn-sm btn-success me-1">Approve</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div v-if="adminSection === 'students'">
                <div class="mb-3">
                    <input type="text" v-model="searchQuery" @keyup.enter="search" class="form-control" placeholder="Search students by name, roll number, or phone...">
                </div>
                <div v-if="students.length === 0" class="alert alert-info">No students found</div>
                <div v-else class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Roll Number</th>
                                <th>Department</th>
                                <th>Semester</th>
                                <th>CGPA</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="student in students" :key="student.id">
                                <td>{{ student.name }}</td>
                                <td>{{ student.roll_number }}</td>
                                <td>{{ student.department }}</td>
                                <td>{{ student.semester }}</td>
                                <td>{{ student.cgpa }}</td>
                                <td>
                                    <span v-if="student.is_blacklisted" class="badge bg-danger">Blacklisted</span>
                                    <span v-else-if="!student.is_active" class="badge bg-secondary">Inactive</span>
                                    <span v-else class="badge bg-success">Active</span>
                                </td>
                                <td>
                                    <button @click="viewStudentProfile(student.id)" class="btn btn-sm btn-info me-1">Profile</button>
                                    <button @click="viewStudentApplications(student.id)" class="btn btn-sm btn-primary me-1">Applications</button>
                                    <button v-if="!student.is_blacklisted" @click="blacklistUser(student.user_id)" class="btn btn-sm btn-dark me-1">Blacklist</button>
                                    <button v-else @click="unblacklistUser(student.user_id)" class="btn btn-sm btn-secondary me-1">Unblacklist</button>
                                    <button v-if="student.is_active" @click="deactivateUser(student.user_id)" class="btn btn-sm btn-warning">Deactivate</button>
                                    <button v-else @click="activateUser(student.user_id)" class="btn btn-sm btn-success">Activate</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div v-if="adminSection === 'applications'">
                <div v-if="applications.length === 0" class="alert alert-info">No applications found</div>
                <div v-else class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Student Name</th>
                                <th>Roll Number</th>
                                <th>Company</th>
                                <th>Drive Title</th>
                                <th>Job Title</th>
                                <th>Status</th>
                                <th>Applied Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="app in applications" :key="app.id">
                                <td>{{ app.student_name }}</td>
                                <td>{{ app.student_roll }}</td>
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
                                        'bg-success': app.status === 'selected'
                                    }">{{ app.status }}</span>
                                </td>
                                <td>{{ new Date(app.applied_at).toLocaleDateString() }}</td>
                            </tr>
                        </tbody>
                    </table>
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
            
            <!-- Student Applications Modal -->
            <div v-if="showStudentApplicationsModal" class="modal" style="display: block;">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Student Applications</h5>
                            <button type="button" @click="showStudentApplicationsModal = false" class="btn-close" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <div v-if="selectedStudentApplications && selectedStudentApplications.length === 0" class="alert alert-info">No applications found</div>
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
                                        <tr v-for="app in selectedStudentApplications" :key="app.id">
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
                    </div>
                </div>
            </div>
        </div>
    `
};
