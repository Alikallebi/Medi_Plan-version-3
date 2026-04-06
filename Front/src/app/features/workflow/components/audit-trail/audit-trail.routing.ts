import { Routes } from '@angular/router';
import { RoleGuard } from '../../guards/role.guard';
import { AuditTrailComponent } from './audit-trail.component';

export const AUDIT_TRAIL_ROUTES: Routes = [
    {
        path: 'audit-trail',
        component: AuditTrailComponent,
        canActivate: [RoleGuard],
        data: { roles: ['super-admin', 'admin-gta'] }
    }
];
