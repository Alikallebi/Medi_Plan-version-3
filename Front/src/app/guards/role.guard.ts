import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../demo/service/auth.service';

/**
 * Guard basé sur les rôles
 * Vérifie si l'utilisateur a l'un des rôles autorisés
 * 
 * Utilisation dans le routing :
 * {
 *   path: 'admin',
 *   component: AdminComponent,
 *   canActivate: [RoleGuard],
 *   data: { roles: ['super-admin', 'admin-gta'] }
 * }
 */
@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const requiredRoles = route.data['roles'] as string[];

    if (!requiredRoles || requiredRoles.length === 0) {
      console.warn('RoleGuard: aucun rôle spécifié dans les données de la route');
      return true;
    }

    const hasRole = this.authService.isInRole(requiredRoles);

    if (hasRole) {
      return true;
    }

    // Redirection vers une page d'accès refusé ou le dashboard
    this.router.navigate(['/access-denied']);
    return false;
  }
}
