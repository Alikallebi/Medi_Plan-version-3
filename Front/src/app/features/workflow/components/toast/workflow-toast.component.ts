import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { NotificationService, WorkflowToast } from '../../services/notification.service';

@Component({
    selector: 'app-workflow-toast',
    templateUrl: './workflow-toast.component.html',
    styleUrls: ['./workflow-toast.component.scss']
})
export class WorkflowToastComponent implements OnInit, OnDestroy {
    toasts: WorkflowToast[] = [];
    private readonly destroy$ = new Subject<void>();

    constructor(private readonly notificationService: NotificationService) {}

    ngOnInit(): void {
        this.notificationService.toast$
            .pipe(takeUntil(this.destroy$))
            .subscribe(toast => {
                this.toasts = [...this.toasts, toast];
                window.setTimeout(() => this.dismiss(toast.id), toast.duration);
            });
    }

    dismiss(id: string): void {
        this.toasts = this.toasts.filter(toast => toast.id !== id);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
