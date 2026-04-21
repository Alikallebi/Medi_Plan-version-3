import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthService } from '../demo/service/auth.service';
import { RbacService, PermissionLevel } from '../demo/service/rbac.service';
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

    if (!rbacPermission) return true;

    if (this.authService.getUserRole() === 'super-admin') return true;

    if (this.rbacService.isLoaded) {
      return this.check(rbacPermission, rbacMinLevel);
    }

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

