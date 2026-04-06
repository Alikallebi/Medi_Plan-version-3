import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../demo/service/auth.service';
import { RbacService, PermissionLevel } from '../demo/service/rbac.service';

/**
 * Guard basé sur les permissions RBAC dynamiques (table rbac_role_permissions).
 *
 * Utilisation dans le routing :
 * {
 *   path: 'planning',
 *   canActivate: [AuthGuard, PermissionGuard],
 *   data: { rbacPermission: 'planning.view', rbacMinLevel: 'read' }
 * }
 *
 * Niveaux disponibles : 'read' | 'write' | 'validate' | 'admin'
 * Si rbacPermission est absent, la route est autorisée.
 * Le rôle SUPER_ADMIN passe toujours.
 */
@Injectable({
  providedIn: 'root'
})
export class PermissionGuard implements CanActivate {

  constructor(
    private authService: AuthService,
    private rbacService: RbacService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> | boolean {
    const rbacPermission = route.data['rbacPermission'] as string | undefined;
    const rbacMinLevel = (route.data['rbacMinLevel'] as PermissionLevel | undefined) ?? 'read';

    // Aucune permission requise → accès libre
    if (!rbacPermission) return true;

    // SUPER_ADMIN bypass complet
    if (this.authService.getUserRole() === 'super-admin') return true;

    // Si les permissions sont déjà chargées → vérification synchrone
    if (this.rbacService.isLoaded) {
      return this.check(rbacPermission, rbacMinLevel);
    }

    // Sinon attendre le chargement
    return this.rbacService.whenLoaded().pipe(
      map(() => this.check(rbacPermission, rbacMinLevel))
    );
  }

  private check(permissionCode: string, minLevel: PermissionLevel): boolean {
    const allowed = this.rbacService.hasPermission(permissionCode, minLevel);
    if (!allowed) {
      this.router.navigate(['/auth/access-denied']);
    }
    return allowed;
  }
}

