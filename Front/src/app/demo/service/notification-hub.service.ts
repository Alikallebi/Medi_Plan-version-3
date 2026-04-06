import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, of, timer } from 'rxjs';
import { switchMap, catchError, tap, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface WorkflowNotification {
    id: string;
    userId: string;
    // Types EF Core (anciens) + types MySQL (nouveaux)
    type: 'WORKFLOW_SUBMITTED' | 'WORKFLOW_APPROVED' | 'WORKFLOW_REJECTED' | 'WORKFLOW_REMINDER'
        | 'VERSION_CREATED' | 'WORKFLOW_MODIFICATION_REQUESTED'
        | 'WORKFLOW_SOUMIS' | 'WORKFLOW_VALIDE' | 'WORKFLOW_REJETE' | 'WORKFLOW_REVISION'
        | 'DEMANDE_A_VALIDER';
    planningId: string;
    message: string;
    titre?: string;
    actionUrl?: string;
    isRead: boolean;
    createdAt: string;
    readAt?: string;
}

/** Réponse brute depuis l'API MySQL (/api/notifications) */
interface MySqlNotificationRaw {
    id: number;
    userId: number;
    type: string;
    titre: string;
    message: string;
    planningId?: number;
    planningWeekId?: number;
    lu: boolean;
    dateCreation: string;
    dateLecture?: string;
    lien?: string;
    emetteurId?: number;
}

@Injectable({
    providedIn: 'root'
})
export class NotificationHubService {
    /** URL MySQL (nouvelle API, utilise header X-User-Id) */
    private readonly mysqlApiUrl = `${environment.apiBaseUrl}/api/notifications`;
    private readonly notificationsSubject = new BehaviorSubject<WorkflowNotification[]>([]);
    private readonly unreadCountSubject = new BehaviorSubject<number>(0);
    private pollingSub: Subscription | null = null;
    
    readonly notifications$ = this.notificationsSubject.asObservable();
    readonly unreadCount$ = this.unreadCountSubject.asObservable();

    constructor(private readonly http: HttpClient) {}

    /** Construit les headers X-User-Id pour l'API MySQL */
    private authHeaders(userId: string): HttpHeaders {
        return new HttpHeaders({ 'X-User-Id': userId });
    }

    /**
     * Démarre le polling des notifications (API MySQL /api/notifications)
     * Charge immédiatement (délai=0) puis toutes les intervalMs ms.
     */
    startPolling(userId: string, intervalMs: number = 30000): void {
        // Éviter les doublons si déjà actif
        if (this.pollingSub && !this.pollingSub.closed) {
            this.pollingSub.unsubscribe();
        }
        console.log(`🔔 [NotificationHub] Polling démarré userId=${userId}`);
        this.pollingSub = timer(0, intervalMs)
            .pipe(switchMap(() => this.loadNotifications(userId)))
            .subscribe();
    }

    /**
     * Charge les notifications depuis l'API MySQL.
     * Répond à GET /api/notifications (header X-User-Id)
     */
    private loadNotifications(userId: string): Observable<WorkflowNotification[]> {
        return this.http
            .get<MySqlNotificationRaw[]>(this.mysqlApiUrl, { headers: this.authHeaders(userId) })
            .pipe(
                map(raw => (Array.isArray(raw) ? raw : []).map(n => this.mapMySql(n))),
                tap(notifications => {
                    this.notificationsSubject.next(notifications);
                    const unreadCount = notifications.filter(n => !n.isRead).length;
                    this.unreadCountSubject.next(unreadCount);
                    console.log(`🔔 [NotificationHub] ${notifications.length} notifs, ${unreadCount} non lues`);
                }),
                catchError(error => {
                    console.error('[NotificationHub] Erreur chargement:', error);
                    return of([] as WorkflowNotification[]);
                })
            );
    }

    /** Recharge manuellement */
    refresh(userId: string): void {
        this.loadNotifications(userId).subscribe();
    }

    /**
     * Marque une notification comme lue.
     * POST /api/notifications/{id}/lire  (header X-User-Id)
     */
    markAsRead(notificationId: string, userId: string): Observable<any> {
        return this.http
            .post(`${this.mysqlApiUrl}/${notificationId}/lire`, {}, { headers: this.authHeaders(userId) })
            .pipe(
                tap(() => {
                    const updated = this.notificationsSubject.value.map(n =>
                        n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
                    );
                    this.notificationsSubject.next(updated);
                    this.unreadCountSubject.next(updated.filter(n => !n.isRead).length);
                }),
                catchError(error => {
                    console.error('[NotificationHub] Erreur markAsRead:', error);
                    throw error;
                })
            );
    }

    /**
     * Marque toutes les notifications comme lues.
     * POST /api/notifications/lire-tout  (header X-User-Id)
     */
    markAllAsRead(userId: string): Observable<any> {
        return this.http
            .post(`${this.mysqlApiUrl}/lire-tout`, {}, { headers: this.authHeaders(userId) })
            .pipe(
                tap(() => {
                    const updated = this.notificationsSubject.value.map(n =>
                        ({ ...n, isRead: true, readAt: new Date().toISOString() })
                    );
                    this.notificationsSubject.next(updated);
                    this.unreadCountSubject.next(0);
                }),
                catchError(error => {
                    console.error('[NotificationHub] Erreur markAllAsRead:', error);
                    throw error;
                })
            );
    }

    /**
     * Compte les notifications non lues.
     * GET /api/notifications/count  (header X-User-Id)
     */
    getUnreadCount(userId: string): Observable<{ count: number }> {
        return this.http
            .get<{ count: number }>(`${this.mysqlApiUrl}/count`, { headers: this.authHeaders(userId) })
            .pipe(
                tap(r => this.unreadCountSubject.next(r.count)),
                catchError(() => of({ count: 0 }))
            );
    }

    /**
     * Convertit un enregistrement MySQL brut en WorkflowNotification.
     * Champs MySQL : id, userId, type, titre, message, planningWeekId, lu, dateCreation, lien, emetteurId
     */
    private mapMySql(raw: MySqlNotificationRaw): WorkflowNotification {
        // Normaliser le type MySQL vers le type frontend
        const type = this.normalizeType(raw.type);
        // Résoudre le planningWeekId : utiliser planning_id ou planning_week_id
        const resolvedWeekId = raw.planningId ?? raw.planningWeekId;
        // Construire l'URL de navigation à partir du champ `lien`
        const actionUrl = raw.lien ?? this.defaultActionUrl(raw.type, resolvedWeekId);
        return {
            id: raw.id.toString(),
            userId: raw.userId.toString(),
            type,
            planningId: resolvedWeekId?.toString() ?? '',
            message: raw.message,
            titre: raw.titre,
            actionUrl,
            isRead: raw.lu === true,
            createdAt: raw.dateCreation,
            readAt: raw.dateLecture
        };
    }

    /**
     * Normalise les codes MySQL vers les types frontend attendus.
     * MySQL : WORKFLOW_SOUMIS, WORKFLOW_VALIDE, WORKFLOW_REJETE, WORKFLOW_REVISION
     * Frontend legacy : WORKFLOW_SUBMITTED, WORKFLOW_APPROVED, WORKFLOW_REJECTED, WORKFLOW_MODIFICATION_REQUESTED
     */
    private normalizeType(raw: string): WorkflowNotification['type'] {
        const map: Record<string, WorkflowNotification['type']> = {
            // Types MySQL natifs
            WORKFLOW_SOUMIS:   'WORKFLOW_SOUMIS',
            WORKFLOW_VALIDE:   'WORKFLOW_VALIDE',
            WORKFLOW_REJETE:   'WORKFLOW_REJETE',
            WORKFLOW_REVISION: 'WORKFLOW_REVISION',
            DEMANDE_A_VALIDER: 'WORKFLOW_SOUMIS',
            // Types legacy EF Core (compatibilité)
            WORKFLOW_SUBMITTED:              'WORKFLOW_SUBMITTED',
            WORKFLOW_APPROVED:               'WORKFLOW_APPROVED',
            WORKFLOW_REJECTED:               'WORKFLOW_REJECTED',
            WORKFLOW_REMINDER:               'WORKFLOW_REMINDER',
            VERSION_CREATED:                 'VERSION_CREATED',
            WORKFLOW_MODIFICATION_REQUESTED: 'WORKFLOW_MODIFICATION_REQUESTED',
        };
        return map[raw] ?? 'WORKFLOW_REMINDER';
    }

    /**
     * URL de navigation par défaut selon le type de notification.
     * SOUMIS/VALIDE/REJETE → page de validation du planning.
     */
    private defaultActionUrl(type: string, planningWeekId?: number): string {
        if (planningWeekId) {
            const isForValidator = ['WORKFLOW_SOUMIS', 'WORKFLOW_SUBMITTED'].includes(type);
            return isForValidator
                ? `/workflow/validation/${planningWeekId}`
                : `/workflow/mes-soumissions`;
        }
        return '/workflow/validation-inbox';
    }
}

