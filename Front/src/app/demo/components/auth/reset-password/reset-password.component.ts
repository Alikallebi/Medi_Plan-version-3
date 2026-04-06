import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from 'src/app/demo/service/staff.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css']
})
export class ResetPasswordComponent implements OnInit {
  token: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  passwordsMismatch: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  userEmail: string | null = '';

  constructor(
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
      this.email = params['email'];
    });
  }

onSubmit(): void {
  if (this.password !== this.confirmPassword) {
    this.passwordsMismatch = true;
    return;
  }
  this.passwordsMismatch = false;

  const resetData = {
    token: this.token,
    email: this.email,
    password: this.password,
    confirm_password: this.confirmPassword
  };

  this.userService.resetPassword(resetData).subscribe(
    (response: any) => {
      this.successMessage = 'Mot de passe réinitialisé avec succès.';
      this.errorMessage = '';
      setTimeout(() => {
        this.router.navigate(['/auth/login']);
      }, 3000);
    },
    (error: any) => {
      this.errorMessage = 'Erreur lors de la réinitialisation du mot de passe. Veuillez réessayer.';
      this.successMessage = '';
    }
  );
}

  
  togglePasswordVisibility(field: string): void {
    const passwordField = document.getElementById(field) as HTMLInputElement;
    if (passwordField.type === 'password') {
      passwordField.type = 'text';
    } else {
      passwordField.type = 'password';
    }
  }
}
