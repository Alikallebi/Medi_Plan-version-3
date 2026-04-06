import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ServiceSelectionService, ServiceMedicalSimple } from '../demo/service/service-selection.service';
import { AuthService } from '../demo/service/auth.service';
import { NotificationHubService, WorkflowNotification } from '../demo/service/notification-hub.service';
import { StaffService } from '../demo/service/staff.service';

interface TopbarNotification {
    id: string;
    type: 'info' | 'warning' | 'success' | 'urgent';
    title: string;
    description: string;
    timeAgo: string;
    read: boolean;
}

@Component({
    selector: 'app-topbar',
    templateUrl: './app.topbar.component.html',
    styleUrls: ['./app.topbar.component.css']
})
export class AppTopBarComponent implements OnInit, OnDestroy {
    currentService: ServiceMedicalSimple | null = null;
    availableServices: ServiceMedicalSimple[] = [];
    filteredServices: ServiceMedicalSimple[] = [];
    serviceSearch = '';

    serviceDropdownOpen = false;
    profileMenuOpen = false;
    notificationsPanelOpen = false;

    notifications: TopbarNotification[] = [];
    workflowNotifications: WorkflowNotification[] = [];
    unreadCount = 0;
    profilePhotoUrl: string | null = null;

    private readonly destroy$ = new Subject<void>();

    constructor(
        public readonly router: Router,
        public readonly serviceSelectionService: ServiceSelectionService,
        private readonly authService: AuthService,
        private readonly notificationHub: NotificationHubService,
        private readonly staffService: StaffService
    ) {}

    ngOnInit(): void {
        this.serviceSelectionService.currentService$
            .pipe(takeUntil(this.destroy$))
            .subscribe(service => {
                console.log('🟢 Topbar: Service courant changé:', service);
                this.currentService = service;
            });

        this.serviceSelectionService.services$
            .pipe(takeUntil(this.destroy$))
            .subscribe(services => {
                console.log('🟢 Topbar: Services chargés:', services.length);
                this.availableServices = services;
                this.filteredServices = services;
            });

        // Attendre que le contexte utilisateur soit chargé avant de démarrer le polling notifications
        this.authService.getUserContext()
            .pipe(takeUntil(this.destroy$))
            .subscribe(userContext => {
                if (userContext && userContext.id) {
                    const userId = userContext.id.toString();
                    console.log('🔔 [Topbar] UserId prêt pour notifications:', userId);
                    this.notificationHub.startPolling(userId, 30000);
                    this.loadProfilePhoto(userContext.id);

                    this.notificationHub.notifications$
                        .pipe(takeUntil(this.destroy$))
                        .subscribe(notifications => {
                            console.log('🔔 [Topbar] Notifications reçues:', notifications.length, notifications);
                            this.workflowNotifications = notifications;
                            this.notifications = this.convertWorkflowNotificationsToTopbar(notifications);
                        });

                    this.notificationHub.unreadCount$
                        .pipe(takeUntil(this.destroy$))
                        .subscribe(count => {
                            console.log('🔔 [Topbar] Unread count:', count);
                            this.unreadCount = count;
                        });
                } else {
                    console.warn('⚠️ [Topbar] Contexte utilisateur non chargé, notifications non démarrées');
                }
            });
    }

    toggleServiceDropdown(event: MouseEvent): void {
        event.stopPropagation();
        this.serviceDropdownOpen = !this.serviceDropdownOpen;
        if (this.serviceDropdownOpen) {
            this.profileMenuOpen = false;
            this.notificationsPanelOpen = false;
        }
    }

    selectService(service: ServiceMedicalSimple): void {
        console.log('🟢 Topbar: Sélection du service', service.nom);
        this.serviceSelectionService.setCurrentServiceObject(service);
        this.serviceDropdownOpen = false;
    }

    onSearchServices(value: string): void {
        this.serviceSearch = value;
        this.serviceSelectionService.searchServices(this.serviceSearch)
            .pipe(takeUntil(this.destroy$))
            .subscribe(services => {
                this.filteredServices = services;
            });
    }

    toggleFavorite(service: ServiceMedicalSimple, event: MouseEvent): void {
        event.stopPropagation();
        this.serviceSelectionService.toggleFavorite(service.id);
    }

    // Méthodes pour les filtres rapides
    filterByStatus(status: string): void {
        this.serviceSearch = '';
        switch(status) {
            case 'actif':
                this.filteredServices = this.availableServices.filter(s => s.statut === 'actif');
                break;
            case 'favoris':
                this.filteredServices = this.availableServices.filter(s => s.favorite);
                break;
            case 'recents':
                // À implémenter selon votre logique de services récents
                this.filteredServices = [...this.availableServices].slice(0, 5);
                break;
            default:
                this.filteredServices = [...this.availableServices];
        }
    }

    // Gestion des services
    manageServices(): void {
        this.router.navigate(['/pages/gestion-services']);
        this.serviceDropdownOpen = false;
    }

    addService(): void {
        this.router.navigate(['/pages/ajout-service']);
        this.serviceDropdownOpen = false;
    }

    viewAllServices(): void {
        this.router.navigate(['/pages/services']);
        this.serviceDropdownOpen = false;
    }

    toggleNotificationsPanel(event: MouseEvent): void {
        event.stopPropagation();
        this.notificationsPanelOpen = !this.notificationsPanelOpen;
        this.profileMenuOpen = false;
        this.serviceDropdownOpen = false;
    }

    markAllAsRead(): void {
        const userId = this.getUserId();
        if (userId) {
            this.notificationHub.markAllAsRead(userId).subscribe();
        }
    }

    goToNotificationsPage(): void {
        this.notificationsPanelOpen = false;
        this.router.navigate(['/pages/notifications']);
    }

    onNotificationClick(notification: TopbarNotification): void {
        const workflowNotif = this.workflowNotifications.find(n => n.id === notification.id);
        if (workflowNotif && !workflowNotif.isRead) {
            const userId = this.getUserId();
            if (userId) {
                this.notificationHub.markAsRead(workflowNotif.id, userId).subscribe();
            }
        }

        // Naviguer vers la page liée à la notification
        // Utiliser navigateByUrl pour gérer correctement les query params (ex: ?service=3&weekStart=...)
        if (workflowNotif?.actionUrl) {
            this.router.navigateByUrl(workflowNotif.actionUrl);
            this.notificationsPanelOpen = false;
        }
    }

    private getUserId(): string | null {
        const userContext = this.authService.getCurrentUser();
        if (userContext?.id) {
            return userContext.id.toString();
        }
        return localStorage.getItem('idUser');
    }

    private convertWorkflowNotificationsToTopbar(workflowNotifs: WorkflowNotification[]): TopbarNotification[] {
        return workflowNotifs.map(wn => ({
            id: wn.id,
            type: this.getNotificationTypeFromWorkflow(wn.type),
            title: wn.titre || this.getNotificationTitle(wn.type),
            description: wn.message,
            timeAgo: this.getTimeAgo(wn.createdAt),
            read: wn.isRead
        }));
    }

    get unreadNotifications(): TopbarNotification[] {
        return this.notifications.filter(item => !item.read);
    }

    get readNotifications(): TopbarNotification[] {
        return this.notifications.filter(item => item.read);
    }

    private getNotificationTypeFromWorkflow(type: WorkflowNotification['type']): TopbarNotification['type'] {
        const mapping: Partial<Record<WorkflowNotification['type'], TopbarNotification['type']>> = {
            WORKFLOW_SOUMIS:   'warning',
            WORKFLOW_VALIDE:   'success',
            WORKFLOW_REJETE:   'urgent',
            WORKFLOW_REVISION: 'warning',
            WORKFLOW_SUBMITTED:              'warning',
            WORKFLOW_APPROVED:               'success',
            WORKFLOW_REJECTED:               'urgent',
            WORKFLOW_REMINDER:               'info',
            VERSION_CREATED:                 'info',
            WORKFLOW_MODIFICATION_REQUESTED: 'warning'
        };
        return mapping[type] ?? 'info';
    }

    private getNotificationTitle(type: WorkflowNotification['type']): string {
        const mapping: Partial<Record<WorkflowNotification['type'], string>> = {
            WORKFLOW_SOUMIS:   'Planning à valider',
            WORKFLOW_VALIDE:   'Planning approuvé ✓',
            WORKFLOW_REJETE:   'Planning rejeté',
            WORKFLOW_REVISION: 'Modifications demandées',
            WORKFLOW_SUBMITTED:              'Nouveau planning soumis',
            WORKFLOW_APPROVED:               'Planning approuvé',
            WORKFLOW_REJECTED:               'Planning rejeté',
            WORKFLOW_REMINDER:               'Rappel',
            VERSION_CREATED:                 'Nouvelle version',
            WORKFLOW_MODIFICATION_REQUESTED: 'Modification demandée'
        };
        return mapping[type] ?? 'Notification';
    }

    private getTimeAgo(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours} h`;
        if (diffDays === 1) return 'Hier';
        return `Il y a ${diffDays} j`;
    }

    toggleProfileMenu(event: MouseEvent): void {
        event.stopPropagation();
        this.profileMenuOpen = !this.profileMenuOpen;
        this.notificationsPanelOpen = false;
        this.serviceDropdownOpen = false;
    }

    goHome(): void {
        this.router.navigate(['/dashboard']);
    }

    goToProfile(): void {
        this.router.navigate(['/pages/mon-profil']);
        this.profileMenuOpen = false;
    }

    goToAccountSettings(): void {
        this.router.navigate(['/pages/parametres-compte']);
        this.profileMenuOpen = false;
    }

    goToHelp(): void {
        this.router.navigate(['/pages/support']);
        this.profileMenuOpen = false;
    }

    logout(): void {
        this.authService.logout();
        this.router.navigate(['/auth/login']);
    }

    getNotificationIcon(type: TopbarNotification['type']): string {
        const mapping: Record<TopbarNotification['type'], string> = {
            info: 'pi pi-info-circle',
            warning: 'pi pi-exclamation-triangle',
            success: 'pi pi-check-circle',
            urgent: 'pi pi-bolt'
        };
        return mapping[type];
    }

    getUnreadBadgeLabel(): string {
        if (this.unreadCount <= 0) {
            return '';
        }

        if (this.unreadCount > 99) {
            return '99+';
        }

        if (this.unreadCount > 9) {
            return '9+';
        }

        return this.unreadCount.toString();
    }

    getProfileInitials(): string {
        const userContext = this.authService.getCurrentUser();
        if (userContext?.prenom && userContext?.nom) {
            return `${userContext.prenom.charAt(0)}${userContext.nom.charAt(0)}`.toUpperCase();
        }
        const firstName = localStorage.getItem('prenom') || 'M';
        const lastName = localStorage.getItem('nom') || 'P';
        return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }

    private loadProfilePhoto(userId: number): void {
        if (!Number.isFinite(userId) || userId <= 0) {
            this.profilePhotoUrl = null;
            return;
        }

        this.staffService.getUserById(userId).subscribe({
            next: (user) => {
                this.profilePhotoUrl = this.normalizePhoto(user?.photo);
            },
            error: () => {
                this.profilePhotoUrl = null;
            }
        });
    }

    private normalizePhoto(value: unknown): string | null {
        return typeof value === 'string' && value.trim().length > 0 ? value : null;
    }

    getUserName(): string {
        const userContext = this.authService.getCurrentUser();
        if (userContext?.nomComplet) {
            return userContext.nomComplet;
        }
        const firstName = localStorage.getItem('prenom') || 'Médecin';
        const lastName = localStorage.getItem('nom') || 'Utilisateur';
        return `${firstName} ${lastName}`;
    }

    getUserEmail(): string {
        const userContext = this.authService.getCurrentUser();
        if (userContext?.email) {
            return userContext.email;
        }
        return localStorage.getItem('userEmail') || localStorage.getItem('email') || 'support@mediplan.local';
    }

    getUserRole(): string {
        const userContext = this.authService.getCurrentUser();
        if (!userContext?.role && !userContext?.roleNormalized) return '';
        const roleKey = userContext.roleNormalized || userContext.role;
        
        const roleMapping: Record<string, string> = {
            'super-admin': 'Super Admin',
            'admin-gta': 'Admin GTA',
            'validateur-rh': 'Validateur RH',
               'planificateur-rh': 'Planificateur RH',
            'chef-pole': 'Chef de Pôle',
            'chef-service': 'Chef de Service',
            'chef-equipe': 'Chef d\'Équipe',
            'staff': 'Personnel'
        };
        
        return roleMapping[roleKey] || userContext.role || roleKey;
    }

    getUserService(): string {
        const userContext = this.authService.getCurrentUser();
        if (!userContext?.serviceNom) return 'Non assigné';
        return userContext.serviceNom;
    }

    getUserServiceId(): number | null {
        const userContext = this.authService.getCurrentUser();
        return userContext?.serviceId || null;
    }

    canAccessServiceDropdown(): boolean {
        const userContext = this.authService.getCurrentUser();
        if (!userContext?.roleNormalized) return false;
        
           const allowedRoles = ['super-admin', 'admin-gta', 'validateur-rh', 'planificateur-rh'];
        return allowedRoles.includes(userContext.roleNormalized);
    }

    @HostListener('document:click')
    closeAllPopovers(): void {
        this.serviceDropdownOpen = false;
        this.profileMenuOpen = false;
        this.notificationsPanelOpen = false;
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}