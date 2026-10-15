const { createApp } = Vue;

createApp({
    data() {
        return {
            currentView: 'login',
            // sessionStorage belongs only to this browser tab and is cleared
            // when the tab is closed, unlike localStorage.
            token: sessionStorage.getItem('token') || null,
            user: JSON.parse(sessionStorage.getItem('user')) || null
        }
    },
    computed: {
        isLoggedIn() {
            return !!this.token;
        },
        userRole() {
            return this.user ? this.user.role : null;
        }
    },
    components: {
        LoginRegister,
        AdminDashboard,
        CompanyDashboard,
        StudentDashboard
    },
    methods: {
        handleLoginSuccess(data) {
            this.token = data.token;
            this.user = data.user;
            sessionStorage.setItem('token', this.token);
            sessionStorage.setItem('user', JSON.stringify(this.user));
            this.redirectBasedOnRole();
        },
        
        logout() {
            this.token = null;
            this.user = null;
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
            this.currentView = 'login';
        },
        
        redirectBasedOnRole() {
            if (this.userRole === 'admin') {
                this.currentView = 'admin-dashboard';
            } else if (this.userRole === 'company') {
                this.currentView = 'company-dashboard';
            } else if (this.userRole === 'student') {
                this.currentView = 'student-dashboard';
            }
        }
    },
    mounted() {
        // Remove credentials saved by older versions of the application.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (this.isLoggedIn) {
            this.redirectBasedOnRole();
        }
    },
    template: `
        <div>
            <LoginRegister v-if="currentView === 'login'" @login-success="handleLoginSuccess" />
            <AdminDashboard v-if="currentView === 'admin-dashboard'" :token="token" @logout="logout" />
            <CompanyDashboard v-if="currentView === 'company-dashboard'" :token="token" :user="user" @logout="logout" />
            <StudentDashboard v-if="currentView === 'student-dashboard'" :token="token" :user="user" @logout="logout" />
        </div>
    `
}).mount('#app');
