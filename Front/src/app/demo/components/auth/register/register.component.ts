import { Component } from '@angular/core';
import { UserService } from 'src/app/demo/service/staff.service';
import { Message, MessageService } from 'primeng/api';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  formData = {
    nom: '',
    email: '',
    password: '',
    confirmPassword: ''
  };
  msgs: Message[] = [];
  hidePassword: boolean = true;
  hidePasswordConfirm: boolean = true;
  formSubmitted: boolean = false; 
  errorMsg: string = '';

  constructor(
    private userService: UserService,
    private messageService: MessageService,
    private router: Router
  ) {}

  onSubmit() {
    this.formSubmitted = true;
    this.errorMsg = '';

    // Validation côté client
    if (!this.formData.nom || this.formData.nom.trim() === '') {
      this.errorMsg = 'Le champ Nom est obligatoire.';
      return;
    }

    if (!this.formData.email || !this.isValidEmail(this.formData.email)) {
      this.errorMsg = 'Veuillez entrer une adresse email valide se terminant par .com';
      return;
    }

    if (!this.formData.password || !this.isValidPassword(this.formData.password)) {
      this.errorMsg = 'Le mot de passe doit contenir au moins 5 caractères, dont une majuscule, une minuscule et un chiffre.';
      return;
    }

    if (!this.formData.confirmPassword || this.formData.password !== this.formData.confirmPassword) {
      this.errorMsg = 'Les mots de passe doivent correspondre.';
      return;
    }

    // Créer l'objet User avec TOUS les champs requis
    const userToRegister = {
      nom: this.formData.nom,
      email: this.formData.email,
      password: this.formData.password,
      confirmPassword: this.formData.confirmPassword,
      prenom: null,  // ou '' si vous préférez
      tel: null,
      specialite: null,
      localisation: null
    };

    // Appel du service
    this.userService.registerUser(userToRegister).subscribe(
      (response: any) => {
        console.log('User registered successfully:', response);
        this.showSuccessViaMessages();
        this.resetForm();
        
        // Redirection vers la page de login après 2 secondes
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      },
      (error: any) => {
        console.error('Error registering user:', error);
        this.errorMsg = error.error || error.message || 'Erreur lors de l\'inscription';
        this.messageService.add({ 
          severity: 'error', 
          summary: 'Erreur', 
          detail: this.errorMsg 
        });
      }
    );
  }

  // Validate password format
  isValidPassword(password: string): boolean {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{5,}$/;
    return passwordRegex.test(password);
  }

  // Validate email format
  isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const requiredSuffix = /\.com$/i;
    return emailRegex.test(email) && requiredSuffix.test(email);
  }

  resetForm(): void {
    this.formData = {
      nom: '',
      email: '',
      password: '',
      confirmPassword: ''
    };
    this.formSubmitted = false;
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  togglePasswordConfirmVisibility(): void {
    this.hidePasswordConfirm = !this.hidePasswordConfirm;
  }

  showSuccessViaMessages() {
    this.messageService.add({ 
      severity: 'success', 
      summary: 'Inscription réussie', 
      detail: 'Votre compte a été créé avec succès!' 
    });
  }
}