import { Component, ElementRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../demo/service/staff.service';
import { RbacService } from '../demo/service/rbac.service';
import { AuthService } from '../demo/service/auth.service';
import { Subscription } from 'rxjs';

interface SidebarItem {
    label: string;
    icon: string;
    route?: string;
    isTitle?: boolean;
    permission?: string;
    sectionPerms?: string[];
}

@Component({
    selector: 'app-sidebar',
    templateUrl: './app.sidebar.component.html',
    styleUrls: ['./app.sidebar.component.css']
})
export class AppSidebarComponent implements OnDestroy {
    isCollapsed = false;
    private permSub?: Subscription;
    private currentRole = '';
    private currentUserId: number | null = null;

    private allMainNavigation: SidebarItem[] = [
        { label: 'Tableau de bord', icon: 'pi pi-home',     route: '/dashboard',          permission: 'dashboard.view' },
        { label: 'Espace personnel', icon: 'pi pi-user',     route: '/pages/mon-espace' },
        { label: 'Planning',        icon: 'pi pi-calendar', route: '/pages/planning',     permission: 'planning.view' },
        { label: 'Personnel',       icon: 'pi pi-id-card',  route: '/pages/utilisateurs', permission: 'personnel.view' }
    ];

    private allDataManagement: SidebarItem[] = [
        {
            label: 'Workflow & Validation', icon: 'pi pi-check-circle', isTitle: true,
            sectionPerms: ['workflow.soumissions', 'workflow.inbox', 'workflow.admin-dashboard', 'workflow.audit']
        },
        { label: 'Mes Soumissions',        icon: 'pi pi-send',      route: '/workflow/mes-soumissions',   permission: 'workflow.soumissions' },
        { label: 'Boîte de validation',    icon: 'pi pi-inbox',     route: '/workflow/validation-inbox',  permission: 'workflow.inbox' },
        { label: 'Tableau de bord Admin',  icon: 'pi pi-chart-bar', route: '/workflow/admin-dashboard',   permission: 'workflow.admin-dashboard' },
        { label: 'Piste d\'audit',         icon: 'pi pi-file-edit', route: '/workflow/audit-trail',       permission: 'workflow.audit' },
        {
            label: 'Référentiel clinique', icon: 'pi pi-database', isTitle: true,
            sectionPerms: ['referentiel.services', 'referentiel.equipes', 'referentiel.competences', 'referentiel.postes']
        },
        { label: 'Services médicaux',      icon: 'pi pi-building', route: '/pages/services',    permission: 'referentiel.services' },
        { label: 'Équipes',                icon: 'pi pi-users',    route: '/pages/pole',         permission: 'referentiel.equipes' },
        { label: 'Compétences',            icon: 'pi pi-star',     route: '/pages/competence',   permission: 'referentiel.competences' },
        { label: 'Postes de travail',      icon: 'pi pi-clock',    route: '/pages/poste',        permission: 'referentiel.postes' },
        {
            label: 'Planification', icon: 'pi pi-calendar-plus', isTitle: true,
            sectionPerms: ['planification.regles', 'indisponibilites.view']
        },
        { label: 'Règles de planification', icon: 'pi pi-sliders-h', route: '/pages/regles', permission: 'planification.regles' },
        { label: 'Indisponibilités', icon: 'pi pi-ban', route: '/pages/indisponibilite', permission: 'indisponibilites.view' },
        {
            label: 'Administration', icon: 'pi pi-shield', isTitle: true,
            sectionPerms: ['admin.utilisateurs', 'admin.utilisateur-detail', 'admin.roles']
        },
        { label: 'Utilisateurs',      icon: 'pi pi-user',    route: '/pages/utilisateurs',  permission: 'admin.utilisateurs' },
        { label: 'Détail utilisateur', icon: 'pi pi-id-card', route: '/pages/user-detail',   permission: 'admin.utilisateur-detail' },
        { label: 'Rôles & permissions', icon: 'pi pi-lock',   route: '/pages/roles-permissions', permission: 'admin.roles' },
    ];

    private allToolsNavigation: SidebarItem[] = [
        { label: 'Notifications', icon: 'pi pi-bell',       route: '/pages/notifications', permission: 'outils.notifications' },
        { label: 'Demandes en attente', icon: 'pi pi-clock', route: '/pages/demandes-attente', permission: 'workflow.inbox' },
        { label: 'Historique',    icon: 'pi pi-history',    route: '/pages/historique',    permission: 'outils.historique' },
        { label: 'Rapports',      icon: 'pi pi-chart-line', route: '/uikit/charts',        permission: 'outils.rapports' }
    ];

    mainNavigation: SidebarItem[] = [];
    dataManagement: SidebarItem[] = [];
    toolsNavigation: SidebarItem[] = [];

    constructor(
        private readonly router: Router,
        private readonly userService: UserService,
        public readonly el: ElementRef,
        private readonly rbac: RbacService,
        private readonly authService: AuthService,
        private readonly cdr: ChangeDetectorRef
    ) {
        this.permSub = this.rbac.permissions$.subscribe(() => {
            this.currentRole = this.resolveCurrentRole();
            this.currentUserId = this.authService.getUserId();
            this.rebuildVisibleItems();
            this.cdr.markForCheck();
        });
    }

    ngOnDestroy(): void {
        this.permSub?.unsubscribe();
    }

    private canSee(item: SidebarItem): boolean {
        if (item.isTitle) {
            if (!item.sectionPerms || item.sectionPerms.length === 0) return true;
            return item.sectionPerms.some(p => this.rbac.canView(p));
        }
        return !item.permission || this.rbac.canView(item.permission);
    }

    private resolveCurrentRole(): string {
        const fromContext = (this.authService.getUserRole() || '').trim().toLowerCase();
        if (fromContext) {
            return fromContext;
        }

        const fromStorage = (localStorage.getItem('role') || '').trim().toLowerCase();
        return fromStorage.replace(/_/g, '-');
    }

    private isStaffRole(): boolean {
        return this.currentRole === 'staff';
    }

    private buildStaffMainNavigation(): SidebarItem[] {
        const userId = this.currentUserId || Number(localStorage.getItem('idUser') || '0');
        const detailRoute = Number.isFinite(userId) && userId > 0
            ? `/pages/utilisateurs/${userId}`
            : '/pages/mon-compte';

        return [
            { label: 'Tableau de bord', icon: 'pi pi-home', route: '/dashboard' },
            { label: 'Espace personnel', icon: 'pi pi-user', route: '/pages/mon-espace' },
            { label: 'Mon compte', icon: 'pi pi-id-card', route: detailRoute }
        ];
    }

    private buildStaffToolsNavigation(): SidebarItem[] {
        return [
            { label: 'Notifications', icon: 'pi pi-bell', route: '/pages/notifications' },
            { label: 'Historique', icon: 'pi pi-history', route: '/pages/historique' }
        ];
    }

    private rebuildVisibleItems(): void {
        if (this.isStaffRole()) {
            this.mainNavigation = this.buildStaffMainNavigation();
            this.dataManagement = [];
            this.toolsNavigation = this.buildStaffToolsNavigation();
            return;
        }

        this.mainNavigation = this.allMainNavigation.filter(item => this.canSee(item));
        this.dataManagement = this.allDataManagement.filter(item => this.canSee(item));
        this.toolsNavigation = this.allToolsNavigation.filter(item => this.canSee(item));
    }

    toggleSidebar(): void {
        this.isCollapsed = !this.isCollapsed;
    }

    navigate(item: SidebarItem): void {
        if (!item.isTitle && item.route) {
            this.router.navigate([item.route]);
        }
    }

    logout(): void {
        this.userService.logout();
        this.router.navigate(['/auth/login']);
    }
}