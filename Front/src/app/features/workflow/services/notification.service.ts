import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type WorkflowToastType = 'success' | 'error' | 'warning' | 'info';

export interface WorkflowToast {
    id: string;
    type: WorkflowToastType;
    message: string;
    duration: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
    private readonly toastSubject = new Subject<WorkflowToast>();
    readonly toast$ = this.toastSubject.asObservable();

    success(message: string, duration = 5000): void {
        this.emit('success', message, duration);
    }

    error(message: string, duration = 8000): void {
        this.emit('error', message, duration);
    }

    warning(message: string, duration = 6000): void {
        this.emit('warning', message, duration);
    }

    info(message: string, duration = 4000): void {
        this.emit('info', message, duration);
    }

    private emit(type: WorkflowToastType, message: string, duration: number): void {
        this.toastSubject.next({
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            type,
            message,
            duration
        });
    }
}
