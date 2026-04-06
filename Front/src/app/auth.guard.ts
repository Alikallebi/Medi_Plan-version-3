// auth.guard.ts
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './demo/service/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  canActivate(): boolean {
    // Vérifie si l'utilisateur est connecté en utilisant le AuthService
    const isLoggedIn = this.authService.isLoggedIn();

    if (isLoggedIn) {
      return true; // L'utilisateur est connecté
    } else {
      this.router.navigate(['/auth/login']); // Redirection vers login si non connecté
      return false;
    }
  }
}
