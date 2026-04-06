import { OnInit, OnDestroy } from '@angular/core';
import { Component } from '@angular/core';
import { LayoutService } from './service/app.layout.service';
import { UserService } from '../demo/service/staff.service';
import { Router } from '@angular/router';
import { RbacService } from '../demo/service/rbac.service';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-menu',
    templateUrl: './app.menu.component.html',
    styleUrls: ['./app.menu.component.css']
})
export class AppMenuComponent implements OnInit, OnDestroy {

    model: any[] = [];
    role: any;
    private permSub?: Subscription;

    constructor(
        public layoutService: LayoutService,
        private userService: UserService,
        private router: Router,
        public rbac: RbacService
    ) { }

    ngOnInit() {
        this.role = localStorage.getItem('role');
        this.buildModel();
        // Reconstruction du menu à chaque mise à jour des permissions RBAC
        this.permSub = this.rbac.permissions$.subscribe(() => this.buildModel());
    }

    ngOnDestroy() {
        this.permSub?.unsubscribe();
    }

    private buildModel(): void {
        const r = this.rbac;
        this.model = [
            {
                label: 'Home',
                items: [
                    {
                        label: 'Tableau de bord',
                        icon: 'pi pi-fw pi-home',
                        command: () => this.navigateToDashboard(),
                        visible: r.canView('dashboard.view')
                    }
                ]
            },
            {
                items: [{
                    label: 'Utilisateur',
                    icon: 'pi pi-fw pi-user',
                    routerLink: ['/pages/utilisateurs'],
                    visible: r.canView('admin.utilisateurs')
                }]
            },
            {
                items: [{
                    label: 'Catalogue des postes',
                    icon: 'pi pi-fw pi-clock',
                    routerLink: ['/pages/poste'],
                    visible: r.canView('referentiel.postes')
                }]
            },
            {
                items: [{
                    label: 'Calendrier',
                    icon: 'pi pi-fw pi-calendar',
                    routerLink: ['/uikit/formlayout'],
                    visible: r.canView('planning.view')
                }]
            },
            {
                items: [{
                    label: 'Soumission Planning',
                    icon: 'pi pi-fw pi-send',
                    routerLink: ['/pages/planning'],
                    visible: r.canView('planning.view')
                }]
            },
            {
                items: [{
                    label: 'Enregistrer',
                    icon: 'pi pi-fw pi-user-plus',
                    routerLink: ['/auth/register'],
                    visible: this.role === 'RH' || r.canEdit('admin.utilisateurs')
                }]
            },
            {
                items: [
                    {
                        label: 'Graphiques',
                        icon: 'pi pi-fw pi-chart-bar',
                        routerLink: ['/uikit/charts'],
                        visible: r.canView('outils.rapports')
                    }
                ]
            },
            {
                label: 'Workflow',
                visible: r.canView('workflow.soumissions') || r.canView('workflow.inbox')
                      || r.canView('workflow.admin-dashboard') || r.canView('workflow.audit'),
                items: [
                    {
                        label: 'Dashboard Admin',
                        icon: 'pi pi-fw pi-chart-line',
                        routerLink: ['/workflow/admin-dashboard'],
                        visible: r.canView('workflow.admin-dashboard')
                    },
                    {
                        label: 'Mes Soumissions',
                        icon: 'pi pi-fw pi-send',
                        routerLink: ['/workflow/mes-soumissions'],
                        visible: r.canView('workflow.soumissions')
                    },
                    {
                        label: 'Validation (Inbox)',
                        icon: 'pi pi-fw pi-inbox',
                        routerLink: ['/workflow/validation-inbox'],
                        visible: r.canView('workflow.inbox')
                    },
                    {
                        label: 'Config. Workflows',
                        icon: 'pi pi-fw pi-sitemap',
                        routerLink: ['/workflow/workflow-config'],
                        visible: r.canAdmin('workflow.admin-dashboard')
                    }
                ]
            }
        ];
    }

    private isAdminRole(): boolean {
        const normalized = `${this.role || ''}`.toLowerCase().replace(/_/g, '-');
        return normalized === 'super-admin' || normalized === 'admin-gta';
    }

    logout(): void {
        this.userService.logout();
    }

    navigateToDashboard(): void {
        if (this.userService.isLoggedIn()) {
            this.router.navigate(['/dashboard']);
        } else {
            this.router.navigate(['/auth/login']);
        }
    }
}
