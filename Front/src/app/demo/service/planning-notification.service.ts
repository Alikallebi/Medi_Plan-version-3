import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { PlanningNotification } from '../api/planning.models';
import { PlanningService } from './planning.service';
import { environment } from 'src/environments/environment';

export interface PlanningToast {
    id: string;
    severity: 'success' | 'error' | 'warning' | 'info';
    message: string;
}

@Injectable({
    providedIn: 'root'
})
export class PlanningNotificationService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api`;
    private readonly toastsSubject = new BehaviorSubject<PlanningToast[]>([]);
    readonly toasts$ = this.toastsSubject.asObservable();

    constructor(
        private readonly http: HttpClient,
        private readonly planningService: PlanningService
    ) {}

    showSuccess(message: string): void {
        this.pushToast('success', message);
    }

    showError(message: string): void {
        this.pushToast('error', message);
    }

    showWarning(message: string): void {
        this.pushToast('warning', message);
    }

    showInfo(message: string): void {
        this.pushToast('info', message);
    }

    notifyArretInfo(notification: PlanningNotification): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/notifications/arret`, notification).pipe(
            tap(() => {
                this.planningService.applyArretNotification(notification);
                this.pushToast('info', notification.message);
            }),
            catchError(error => {
                this.pushToast('warning', notification.message);
                return throwError(() => error);
            })
        );
    }

    dismiss(id: string): void {
        this.toastsSubject.next(this.toastsSubject.value.filter(toast => toast.id !== id));
    }

    private pushToast(severity: PlanningToast['severity'], message: string): void {
        const toast: PlanningToast = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            severity,
            message
        };

        this.toastsSubject.next([toast, ...this.toastsSubject.value].slice(0, 5));

        setTimeout(() => {
            this.dismiss(toast.id);
        }, 3500);
    }
}
