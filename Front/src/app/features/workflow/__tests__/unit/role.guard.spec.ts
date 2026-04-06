import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { RoleGuard } from '../../guards/role.guard';

@Component({ template: '' })
class DummyComponent {}

describe('RoleGuard', () => {
    let guard: RoleGuard;
    let router: Router;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [RouterTestingModule.withRoutes([
                { path: 'dashboard', component: DummyComponent }
            ])],
            declarations: [DummyComponent],
            providers: [RoleGuard]
        });

        guard = TestBed.inject(RoleGuard);
        router = TestBed.inject(Router);
    });

    function buildSnapshot(roles: string[]): ActivatedRouteSnapshot {
        const snapshot = new ActivatedRouteSnapshot();
        (snapshot as unknown as { data: Record<string, unknown> }).data = { roles };
        return snapshot;
    }

    it('should allow access for super-admin', () => {
        spyOn(localStorage, 'getItem').and.returnValue('super_admin');

        const result = guard.canActivate(buildSnapshot(['super-admin', 'admin-gta']));

        expect(result).toBeTrue();
    });

    it('should allow access for admin-gta', () => {
        spyOn(localStorage, 'getItem').and.returnValue('admin_gta');

        const result = guard.canActivate(buildSnapshot(['super-admin', 'admin-gta']));

        expect(result).toBeTrue();
    });

    it('should deny access for chef-service', () => {
        spyOn(localStorage, 'getItem').and.returnValue('chef_service');
        const navigateSpy = spyOn(router, 'navigate');

        const result = guard.canActivate(buildSnapshot(['super-admin', 'admin-gta']));

        expect(result).toBeFalse();
        expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should redirect to dashboard when unauthorized', () => {
        spyOn(localStorage, 'getItem').and.returnValue('staff');
        const navigateSpy = spyOn(router, 'navigate');

        guard.canActivate(buildSnapshot(['super-admin']));

        expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should handle missing role data', () => {
        spyOn(localStorage, 'getItem').and.returnValue(null);

        const result = guard.canActivate(buildSnapshot(['super-admin']));

        expect(result).toBeFalse();
    });
});
