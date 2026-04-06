import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AuditDetailModalComponent } from '../audit-detail-modal/audit-detail-modal.component';
import { AuditExportComponent } from '../audit-export/audit-export.component';
import { AuditFiltersComponent } from '../audit-filters/audit-filters.component';
import { AuditExportRequest, AuditTrailEvent, AuditTrailFilter } from '../../models';
import { NotificationService } from '../../services/notification.service';
import { WorkflowService } from '../../services/workflow.service';

@Component({
    selector: 'app-audit-trail',
    standalone: true,
    imports: [
        CommonModule,
        ScrollingModule,
        AuditFiltersComponent,
        AuditExportComponent,
        AuditDetailModalComponent
    ],
    templateUrl: './audit-trail.component.html',
    styleUrls: ['./audit-trail.component.scss']
})
export class AuditTrailComponent implements OnInit {
    events: AuditTrailEvent[] = [];
    total = 0;
    currentPage = 1;
    pageSize = 20;
    loading = false;
    error: string | null = null;
    filters: AuditTrailFilter = {};

    selectedEvent: AuditTrailEvent | null = null;
    showDetailModal = false;

    lastUpdated: Date | null = null;

    constructor(
        private readonly workflowService: WorkflowService,
        private readonly notification: NotificationService
    ) {}

    ngOnInit(): void {
        this.loadAudit();
    }

    get totalPages(): number {
        return Math.max(1, Math.ceil(this.total / this.pageSize));
    }

    loadAudit(): void {
        this.loading = true;
        this.error = null;

        this.workflowService.getAuditTrailGlobal({
            ...this.filters,
            page: this.currentPage,
            limit: this.pageSize
        }).subscribe({
            next: (response) => {
                this.events = response.events;
                this.total = response.total;
                this.currentPage = response.page;
                this.lastUpdated = new Date();
                this.loading = false;
            },
            error: () => {
                this.error = 'Erreur lors du chargement de l\'audit';
                this.loading = false;
                this.notification.error('Impossible de charger l\'historique');
            }
        });
    }

    onFiltersChange(newFilters: AuditTrailFilter): void {
        this.filters = newFilters;
        this.currentPage = 1;
        this.loadAudit();
    }

    onResetFilters(): void {
        this.filters = {};
        this.currentPage = 1;
        this.loadAudit();
    }

    onPageChange(page: number): void {
        this.currentPage = page;
        this.loadAudit();
    }

    onExport(request: AuditExportRequest): void {
        const effectiveFilters: AuditTrailFilter | undefined = request.scope === 'filtered'
            ? { ...this.filters }
            : request.scope === 'last-days'
                ? {
                    dateDebut: new Date(Date.now() - (request.lastDays || 30) * 24 * 3600 * 1000),
                    dateFin: new Date()
                }
                : undefined;

        this.workflowService.exportAuditTrail(request.format, effectiveFilters).subscribe({
            next: (blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit-${new Date().toISOString().split('T')[0]}.${request.format}`;
                a.click();
                window.URL.revokeObjectURL(url);
            },
            error: () => {
                this.notification.error('Erreur lors de l\'export');
            }
        });
    }

    viewEventDetails(event: AuditTrailEvent): void {
        this.workflowService.getAuditEventDetails(event.id).subscribe({
            next: (detail) => {
                this.selectedEvent = detail;
                this.showDetailModal = true;
            },
            error: () => {
                this.notification.error('Impossible de charger le détail de l\'événement');
            }
        });
    }

    closeEventModal(): void {
        this.showDetailModal = false;
        this.selectedEvent = null;
    }

    trackByEventId(index: number, event: AuditTrailEvent): number {
        return event.id ?? index;
    }
}
