import { Routes } from '@angular/router';
import { RoleGuard } from '../../guards/role.guard';
import { AdminDashboardComponent } from './admin-dashboard.component';

export const ADMIN_DASHBOARD_ROUTES: Routes = [
    {
        path: 'admin-dashboard',
        component: AdminDashboardComponent,
        canActivate: [RoleGuard],
        data: { roles: ['super-admin', 'admin-gta'] }
    }
];
