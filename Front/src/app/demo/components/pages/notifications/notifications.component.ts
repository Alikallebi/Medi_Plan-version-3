import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/demo/service/auth.service';
import { NotificationHubService, WorkflowNotification } from 'src/app/demo/service/notification-hub.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent implements OnInit, OnDestroy {
  notifications: WorkflowNotification[] = [];
  unreadOnly = false;
  loading = true;
  private activeUserId: string | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly authService: AuthService,
    private readonly notificationHub: NotificationHubService,
    private readonly router: Router
  ) { }

  ngOnInit(): void {
    this.notificationHub.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(items => {
        this.notifications = items;
        this.loading = false;
      });

    // Initialiser immédiatement si l'ID est déjà disponible
    this.ensurePollingStarted();

    // Au refresh navigateur, le contexte peut arriver quelques ms plus tard.
    // On relance alors automatiquement le polling dès que l'utilisateur est connu.
    this.authService.getUserContext()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.ensurePollingStarted());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get filteredNotifications(): WorkflowNotification[] {
    return this.unreadOnly ? this.notifications.filter(n => !n.isRead) : this.notifications;
  }

  get unreadCount(): number {
    return this.notifications.filter(n => !n.isRead).length;
  }

  isInfoOnlyNotification(type: WorkflowNotification['type']): boolean {
    return type === 'ARRET_INFO';
  }

  onUnreadOnlyChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.unreadOnly = !!target?.checked;
  }

  markAllAsRead(): void {
    const userId = this.getUserId();
    if (!userId) {
      return;
    }
    this.notificationHub.markAllAsRead(userId).subscribe();
  }

  openNotification(item: WorkflowNotification): void {
    const userId = this.getUserId();
    if (!userId) {
      return;
    }

    const navigate = () => {
      if (item.actionUrl) {
        this.router.navigateByUrl(item.actionUrl);
      }
    };

    if (!item.isRead) {
      this.notificationHub.markAsRead(item.id, userId).subscribe({
        next: navigate,
        error: navigate
      });
      return;
    }

    navigate();
  }

  formatDate(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return value;
    }
    return d.toLocaleString('fr-FR');
  }

  getNotificationTypeClass(type: WorkflowNotification['type']): string {
    switch (type) {
      case 'WORKFLOW_SOUMIS':
      case 'WORKFLOW_SUBMITTED':
      case 'WORKFLOW_MODIFICATION_REQUESTED':
      case 'WORKFLOW_REVISION':
        return 'warning';
      case 'WORKFLOW_VALIDE':
      case 'WORKFLOW_APPROVED':
        return 'success';
      case 'WORKFLOW_REJETE':
      case 'WORKFLOW_REJECTED':
        return 'urgent';
      case 'WORKFLOW_REMINDER':
      case 'VERSION_CREATED':
      case 'ARRET_INFO':
        return 'info';
      default:
        return 'default';
    }
  }

  getNotificationIcon(type: WorkflowNotification['type']): string {
    switch (type) {
      case 'WORKFLOW_SOUMIS':
      case 'WORKFLOW_SUBMITTED':
        return 'pi pi-inbox';
      case 'WORKFLOW_VALIDE':
      case 'WORKFLOW_APPROVED':
        return 'pi pi-check-circle';
      case 'WORKFLOW_REJETE':
      case 'WORKFLOW_REJECTED':
        return 'pi pi-times-circle';
      case 'WORKFLOW_REVISION':
      case 'WORKFLOW_MODIFICATION_REQUESTED':
        return 'pi pi-pencil';
      case 'ARRET_INFO':
        return 'pi pi-info-circle';
      case 'VERSION_CREATED':
        return 'pi pi-file';
      case 'WORKFLOW_REMINDER':
      default:
        return 'pi pi-bell';
    }
  }

  getActionLabel(type: WorkflowNotification['type']): string {
    switch (type) {
      case 'WORKFLOW_VALIDE':
      case 'WORKFLOW_APPROVED':
        return 'Action: Validé';
      case 'WORKFLOW_REJETE':
      case 'WORKFLOW_REJECTED':
        return 'Action: Rejeté';
      case 'WORKFLOW_REVISION':
      case 'WORKFLOW_MODIFICATION_REQUESTED':
        return 'Action: Modif demandée';
      case 'WORKFLOW_SOUMIS':
      case 'WORKFLOW_SUBMITTED':
      case 'ARRET_INFO':
        return 'Action: En attente';
      default:
        return 'Action: Information';
    }
  }

  getActionClass(type: WorkflowNotification['type']): string {
    switch (type) {
      case 'WORKFLOW_VALIDE':
      case 'WORKFLOW_APPROVED':
        return 'action-success';
      case 'WORKFLOW_REJETE':
      case 'WORKFLOW_REJECTED':
        return 'action-danger';
      case 'WORKFLOW_REVISION':
      case 'WORKFLOW_MODIFICATION_REQUESTED':
        return 'action-warning';
      case 'WORKFLOW_SOUMIS':
      case 'WORKFLOW_SUBMITTED':
      case 'ARRET_INFO':
        return 'action-pending';
      default:
        return 'action-info';
    }
  }

  private getUserId(): string | null {
    const ctx = this.authService.getCurrentUser();
    if (ctx?.id) {
      return String(ctx.id);
    }
    return localStorage.getItem('idUser');
  }

  private ensurePollingStarted(): void {
    const userId = this.getUserId();
    if (!userId) {
      this.loading = false;
      return;
    }

    if (this.activeUserId === userId) {
      return;
    }

    this.activeUserId = userId;
    this.notificationHub.startPolling(userId, 30000);
    this.notificationHub.refresh(userId);
  }

}
