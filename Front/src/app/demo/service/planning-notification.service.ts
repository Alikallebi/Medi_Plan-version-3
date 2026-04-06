import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface PlanningToast {
    id: string;
    severity: 'success' | 'error' | 'warning' | 'info';
    message: string;
}

@Injectable({
    providedIn: 'root'
})
export class PlanningNotificationService {
    private readonly toastsSubject = new BehaviorSubject<PlanningToast[]>([]);
    readonly toasts$ = this.toastsSubject.asObservable();

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
