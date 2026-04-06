import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
    constructor(private readonly router: Router) {}

    canActivate(route: ActivatedRouteSnapshot): boolean {
        const requiredRoles = (route.data['roles'] as string[] | undefined) || [];
        const userRole = (localStorage.getItem('role') || '').toLowerCase().replace(/_/g, '-');

        console.log('🔒 RoleGuard - Rôle requis:', requiredRoles);
        console.log('🔒 RoleGuard - Rôle utilisateur:', userRole);
        console.log('🔒 RoleGuard - Route:', route.routeConfig?.path);

        if (requiredRoles.length === 0 || requiredRoles.includes(userRole)) {
            console.log('✅ RoleGuard - Accès autorisé');
            return true;
        }

        console.warn('❌ RoleGuard - Accès refusé, redirection vers /dashboard');
        alert(`Accès refusé: Cette page nécessite le rôle ${requiredRoles.join(' ou ')}\nVotre rôle actuel: ${userRole || 'non défini'}`);
        this.router.navigate(['/workflow/validation-inbox']);
        return false;
    }
}
