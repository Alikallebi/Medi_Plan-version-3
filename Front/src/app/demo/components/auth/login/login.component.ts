import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/demo/service/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  email: string = '';
  password: string = '';
  rememberMe = true;
  showPassword = false;
  isLoading = false;
  loginErrorMessage: string = '';
  loginSuccessMessage: string = '';
  currentTime = '';
  greeting = 'Bonsoir';
  readonly version = 'v2.5.0';
  readonly particles = Array.from({ length: 18 }, (_, i) => i + 1);
  readonly quote = 'Une bonne planification sauve du temps, une excellente planification sauve des vies.';

  private clockInterval?: ReturnType<typeof setInterval>;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      this.email = rememberedEmail;
      this.rememberMe = true;
    }

    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  ngOnDestroy(): void {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }

  signIn(): void {
    if (this.isLoading) {
      return;
    }

    if (!this.email || !this.password) {
      this.loginErrorMessage = 'Veuillez saisir votre email et mot de passe';
      this.loginSuccessMessage = '';
      return;
    }

    this.isLoading = true;
    this.loginErrorMessage = '';
    this.loginSuccessMessage = '';

    this.authService.login(this.email, this.password).subscribe({
      next: ({ user }) => {
        if (this.rememberMe) {
          localStorage.setItem('rememberedEmail', this.email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }

        this.loginSuccessMessage = 'Connexion réussie !';
        this.loginErrorMessage = '';
        this.isLoading = false;
        
        // Navigation après un court délai pour afficher le message de succès
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 500);
      },
      error: () => {
        this.loginErrorMessage = 'Email ou mot de passe incorrect';
        this.loginSuccessMessage = '';
        this.password = '';
        this.isLoading = false;
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  redirectToForgotPassword(): void {
    this.router.navigate(['/auth/reset-password']);
  }

  private updateClock(): void {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const hour = now.getHours();
    if (hour >= 5 && hour < 12) {
      this.greeting = 'Bonjour';
    } else if (hour >= 12 && hour < 18) {
      this.greeting = 'Bon après-midi';
    } else {
      this.greeting = 'Bonsoir';
    }
  }
}
