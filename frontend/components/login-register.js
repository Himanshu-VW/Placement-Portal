const LoginRegister = {
    props: ['token', 'user'],
    emits: ['login-success', 'register-success'],
    data() {
        return {
            currentView: 'login',
            loginForm: {
                username: '',
                password: ''
            },
            registerForm: {
                username: '',
                password: '',
                email: '',
                role: 'student'
            },
            error: '',
            success: ''
        }
    },
    methods: {
        async login() {
            this.error = '';
            this.success = '';
            
            try {
                const response = await axios.post('http://localhost:5000/api/login', this.loginForm);
                
                if (response.data.token) {
                    this.$emit('login-success', {
                        token: response.data.token,
                        user: response.data.user
                    });
                }
            } catch (error) {
                this.error = error.response?.data?.error || 'Login failed';
            }
        },
        
        async register() {
            this.error = '';
            this.success = '';
            
            try {
                const response = await axios.post('http://localhost:5000/api/register', this.registerForm);
                
                if (response.data.requires_approval) {
                    this.success = response.data.message;
                    this.registerForm = { username: '', password: '', email: '', role: 'student' };
                    setTimeout(() => {
                        this.currentView = 'login';
                    }, 3000);
                } else if (response.data.token) {
                    this.$emit('login-success', {
                        token: response.data.token,
                        user: response.data.user
                    });
                }
            } catch (error) {
                this.error = error.response?.data?.error || 'Registration failed';
            }
        },
        
        showLogin() {
            this.currentView = 'login';
            this.error = '';
            this.success = '';
        },
        
        showRegister() {
            this.currentView = 'register';
            this.error = '';
            this.success = '';
        }
    },
    template: `
        <div>
            <!-- Login Form -->
            <div v-if="currentView === 'login'" class="login-container">
                <h3 class="text-center mb-4">Login</h3>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <div v-if="success" class="alert alert-success">{{ success }}</div>
                <form @submit.prevent="login">
                    <div class="mb-3">
                        <label class="form-label">Username</label>
                        <input type="text" v-model="loginForm.username" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Password</label>
                        <input type="password" v-model="loginForm.password" class="form-control" required>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">Login</button>
                </form>
                <div class="text-center mt-3">
                    <a href="#" @click.prevent="showRegister">Do not have an account? Register</a>
                </div>
            </div>
            
            <!-- Register Form -->
            <div v-if="currentView === 'register'" class="login-container">
                <h3 class="text-center mb-4">Register</h3>
                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                <div v-if="success" class="alert alert-success">{{ success }}</div>
                <form @submit.prevent="register">
                    <div class="mb-3">
                        <label class="form-label">Username</label>
                        <input type="text" v-model="registerForm.username" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Email</label>
                        <input type="email" v-model="registerForm.email" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Password</label>
                        <input type="password" v-model="registerForm.password" class="form-control" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Role</label>
                        <select v-model="registerForm.role" class="form-select" required>
                            <option value="student">Student</option>
                            <option value="company">Company</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">Register</button>
                </form>
                <div class="text-center mt-3">
                    <a href="#" @click.prevent="showLogin">Already have an account? Login</a>
                </div>
                <div class="text-center mt-2 text-muted small">
                    Note: Students can register directly. Companies need admin approval.
                </div>
            </div>
        </div>
    `
};
