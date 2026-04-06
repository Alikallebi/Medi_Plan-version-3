import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from 'src/app/demo/service/auth.service';
import { UserContext } from '../../models/user-context.model';
import { PlanningWorkflow } from '../../models';
import { NotificationService } from '../../services/notification.service';
import { WorkflowService } from '../../services/workflow.service';
import { ValidationApproveEvent, ValidationRejectEvent, ValidationRequestChangeEvent } from '../validation-card/validation-card.component';

@Component({
    selector: 'app-validation-inbox',
    templateUrl: './validation-inbox.component.html',
    styleUrls: ['./validation-inbox.component.scss']
})
export class ValidationInboxComponent implements OnInit, OnDestroy {
    userContext: UserContext | null = null;
    
    isLoading = false;
    hasError = false;
    errorMessage = '';

    searchTerm = '';
    selectedService = 'all';
    selectedStatus = 'all';
    sortBy: 'urgence' | 'date' | 'service' = 'urgence';

    plannings: PlanningWorkflow[] = [];
    planningsEnAttente: PlanningWorkflow[] = [];
    planningsRecents: PlanningWorkflow[] = [];
    planningsFinaux: PlanningWorkflow[] = [];

    isActionLoading = false;
    
    private destroy$ = new Subject<void>();

    constructor(
        private readonly authService: AuthService,
        private readonly workflowService: WorkflowService,
        private readonly notification: NotificationService,
        private readonly router: Router
    ) {}

    ngOnInit(): void {
        // S'abonner au contexte utilisateur
        this.authService.userContext$
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (context) => {
                    this.userContext = context;
                    if (context) {
                        this.loadPlannings();
                    }
                },
                error: () => {
                    this.hasError = true;
                    this.errorMessage = 'Impossible de charger le contexte utilisateur';
                }
            });
    }
    
    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    get isSuperAdmin(): boolean {
        return this.userContext?.roleNormalized === 'super-admin';
    }

    get isAdmin(): boolean {
        return this.userContext?.roleNormalized === 'super-admin' || 
               this.userContext?.roleNormalized === 'admin-gta';
    }
    
    get userName(): string {
        return this.userContext?.nomComplet || 'Utilisateur';
    }
    
    get userRole(): string {
        return this.userContext?.role || 'Staff';
    }

    get waitingCount(): number {
        return this.planningsEnAttente.length + this.planningsFinaux.length;
    }

    get treatedThisMonthCount(): number {
        return this.planningsRecents.length;
    }

    get serviceOptions(): string[] {
        const values = new Set(this.plannings.map(item => item.serviceName).filter(Boolean));
        return Array.from(values).sort((a, b) => a.localeCompare(b, 'fr'));
    }

    loadPlannings(): void {
        if (!this.userContext) {
            this.hasError = true;
            this.errorMessage = 'Contexte utilisateur non disponible';
            return;
        }
        
        this.isLoading = true;
        this.hasError = false;
        this.errorMessage = '';

        // Utiliser la nouvelle méthode avec filtrage automatique par contexte
        this.workflowService.getPlanningsAValiderParContexte(this.userContext).subscribe({
            next: (plannings) => {
                this.plannings = plannings || [];
                this.applyFiltersAndRoleViews();
                this.isLoading = false;
            },
            error: () => {
                this.hasError = true;
                this.errorMessage = 'Impossible de charger les validations en attente.';
                this.isLoading = false;
            }
        });
    }

    onFiltersChanged(): void {
        this.applyFiltersAndRoleViews();
    }

    onVoirDetails(planningId: number): void {
        this.router.navigate(['/workflow/validation', planningId]);
    }

    goToAdminDashboard(): void {
        this.router.navigate(['/workflow/admin-dashboard']);
    }

    onValider(payload: ValidationApproveEvent): void {
        this.isActionLoading = true;
        this.workflowService.approuverEtape(payload.planningId, payload.commentaire).subscribe({
            next: () => {
                this.notification.success('Planning approuvé avec succès');
                this.isActionLoading = false;
                this.loadPlannings();
            },
            error: () => {
                this.hasError = true;
                this.errorMessage = 'Échec de validation du planning.';
                this.notification.error('Erreur lors de l\'approbation');
                this.isActionLoading = false;
            }
        });
    }

    onRejeter(payload: ValidationRejectEvent): void {
        this.isActionLoading = true;
        this.workflowService.rejeterPlanning(payload.planningId, payload.motif, payload.commentaire).subscribe({
            next: () => {
                this.notification.warning('Planning rejeté');
                this.isActionLoading = false;
                this.loadPlannings();
            },
            error: () => {
                this.notification.error('Erreur lors du rejet du planning');
                this.isActionLoading = false;
            }
        });
    }

    onDemanderModification(payload: ValidationRequestChangeEvent): void {
        this.isActionLoading = true;
        this.workflowService.demanderModification(payload.planningId, payload.instructions).subscribe({
            next: () => {
                this.notification.info('Demande de modification envoyée');
                this.isActionLoading = false;
                this.loadPlannings();
            },
            error: () => {
                this.notification.error('Erreur lors de la demande de modification');
                this.isActionLoading = false;
            }
        });
    }

    getJoursEnAttente(dateSoumission: Date): number {
        return Math.floor((Date.now() - new Date(dateSoumission).getTime()) / (1000 * 60 * 60 * 24));
    }

    getDelaiRestant(delaiMaxHeures: number, dateSoumission: Date): number {
        const heuresEcoulees = (Date.now() - new Date(dateSoumission).getTime()) / (1000 * 60 * 60);
        return Math.max(0, Math.floor(delaiMaxHeures - heuresEcoulees));
    }

    isUrgent(planning: PlanningWorkflow): boolean {
        const submission = this.getSubmissionDate(planning);
        if (!submission) {
            return false;
        }

        return this.getDelaiRestant(72, submission) < 24;
    }

    isOverdue(planning: PlanningWorkflow): boolean {
        const submission = this.getSubmissionDate(planning);
        if (!submission) {
            return false;
        }

        return this.getDelaiRestant(72, submission) <= 0;
    }

    trackByPlanning(_: number, planning: PlanningWorkflow): string {
        return planning.id;
    }

    private applyFiltersAndRoleViews(): void {
        const filtered = this.applyFilters(this.plannings);

        const recentlyProcessed = filtered.filter(item => {
            const status = item.workflowStatus?.status;
            return status === 'VALIDE' || status === 'REJETE';
        });

        const pending = filtered.filter(item => {
            const status = item.workflowStatus?.status;
            return status !== 'VALIDE' && status !== 'REJETE';
        });

        if (this.isSuperAdmin) {
            this.planningsFinaux = pending.filter(item => this.isFinalPending(item));
            this.planningsEnAttente = pending.filter(item => !this.isFinalPending(item));
        } else {
            this.planningsFinaux = [];
            this.planningsEnAttente = pending;
        }

        this.planningsRecents = recentlyProcessed;

        this.sortCollection(this.planningsEnAttente);
        this.sortCollection(this.planningsFinaux);
        this.sortCollection(this.planningsRecents);
    }

    private applyFilters(input: PlanningWorkflow[]): PlanningWorkflow[] {
        const term = this.searchTerm.trim().toLowerCase();

        return input.filter(item => {
            const serviceMatch = this.selectedService === 'all' || item.serviceName === this.selectedService;

            const status = item.workflowStatus?.status || '';
            const statusMatch = this.selectedStatus === 'all'
                || (this.selectedStatus === 'urgent' && this.isUrgent(item))
                || (this.selectedStatus === 'overdue' && this.isOverdue(item))
                || status === this.selectedStatus;

            const text = `${item.serviceName} ${item.id} ${status}`.toLowerCase();
            const searchMatch = !term || text.includes(term);

            return serviceMatch && statusMatch && searchMatch;
        });
    }

    private sortCollection(collection: PlanningWorkflow[]): void {
        collection.sort((a, b) => {
            if (this.sortBy === 'service') {
                return (a.serviceName || '').localeCompare(b.serviceName || '', 'fr');
            }

            const aDate = this.getSubmissionDate(a)?.getTime() || 0;
            const bDate = this.getSubmissionDate(b)?.getTime() || 0;

            if (this.sortBy === 'date') {
                return bDate - aDate;
            }

            const urgencyA = this.isOverdue(a) ? 2 : (this.isUrgent(a) ? 1 : 0);
            const urgencyB = this.isOverdue(b) ? 2 : (this.isUrgent(b) ? 1 : 0);
            if (urgencyA !== urgencyB) {
                return urgencyB - urgencyA;
            }

            return bDate - aDate;
        });
    }

    private isFinalPending(planning: PlanningWorkflow): boolean {
        const status = planning.workflowStatus?.status;
        if (status === 'EN_ATTENTE_N2') {
            return true;
        }

        const stepIndex = planning.workflowStatus?.currentStepIndex ?? 0;
        return stepIndex >= 3;
    }

    private getSubmissionDate(planning: PlanningWorkflow): Date | null {
        const source = planning.history?.find(item => item.action === 'SOUMISSION') || planning.history?.[0];
        if (!source?.at) {
            return null;
        }

        const parsed = new Date(source.at);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
}
