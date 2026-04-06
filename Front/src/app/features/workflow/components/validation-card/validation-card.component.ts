import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { UserContext } from '../../models/user-context.model';
import { PlanningWorkflow } from '../../models';
import { ApprobationModalPayload } from '../modals/approbation-modal/approbation-modal.component';
import { DemandeModificationPayload } from '../modals/demande-modification-modal/demande-modification-modal.component';
import { RejetModalPayload } from '../modals/rejet-modal/rejet-modal.component';

export interface ValidationApproveEvent extends ApprobationModalPayload {
    planningId: number;
}

export interface ValidationRejectEvent extends RejetModalPayload {
    planningId: number;
}

export interface ValidationRequestChangeEvent extends DemandeModificationPayload {
    planningId: number;
}

@Component({
    selector: 'app-validation-card',
    templateUrl: './validation-card.component.html',
    styleUrls: ['./validation-card.component.scss']
})
export class ValidationCardComponent {
    @Input() planning!: PlanningWorkflow;
    @Input() showActions = true;
    @Input() userContext: UserContext | null = null;

    @Output() voirDetails = new EventEmitter<number>();
    @Output() valider = new EventEmitter<ValidationApproveEvent>();
    @Output() rejeter = new EventEmitter<ValidationRejectEvent>();
    @Output() demanderModification = new EventEmitter<ValidationRequestChangeEvent>();

    showApprobationModal = false;
    showRejetModal = false;
    showDemandeModal = false;
    isSubmittingAction = false;
    private readonly remainingDelayCache = new Map<string, number>();

    readonly progressionLabels = ['N1', 'N2', 'RH', 'Super Admin'];

    constructor(private readonly router: Router) {}

    get planningTitle(): string {
        const periodStart = this.planning?.weekStart ? new Date(this.planning.weekStart) : null;
        if (!periodStart || Number.isNaN(periodStart.getTime())) {
            return `Planning ${this.planning?.serviceName || ''}`.trim();
        }

        const month = periodStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const service = this.planning?.serviceName || 'Service';
        return `Planning ${month} - ${service}`;
    }

    get createdByLabel(): string {
        const submission = this.getSubmissionHistory();
        return submission?.author || '—';
    }

    get createdAtLabel(): string {
        const submission = this.getSubmissionHistory();
        const date = submission?.at ? new Date(submission.at) : null;
        if (!date || Number.isNaN(date.getTime())) {
            return '—';
        }
        return date.toLocaleDateString('fr-FR');
    }

    get waitingDays(): number {
        const submissionDate = this.getSubmissionDate();
        if (!submissionDate) {
            return 0;
        }

        const diff = Date.now() - submissionDate.getTime();
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    get remainingHours(): number {
        const maxDelayHours = 72;
        const submissionDate = this.getSubmissionDate();
        if (!submissionDate) {
            return maxDelayHours;
        }

        return this.getMemoizedRemainingHours(submissionDate, maxDelayHours);
    }

    get urgencyClass(): string {
        if (this.remainingHours <= 0) {
            return 'card-overdue';
        }
        if (this.remainingHours < 24) {
            return 'card-warning';
        }
        return 'card-normal';
    }

    get currentStepIndex(): number {
        return Math.max(0, this.planning?.workflowStatus?.currentStepIndex ?? 0);
    }

    get isValidated(): boolean {
        return this.planning?.workflowStatus?.status === 'VALIDE';
    }

    get isRejected(): boolean {
        return this.planning?.workflowStatus?.status === 'REJETE';
    }
    
    /**
     * Vérifie si l'utilisateur peut valider ce planning
     * Basé sur les permissions ET le périmètre
     */
    get peutValider(): boolean {
        if (!this.userContext || !this.planning) {
            return false;
        }
        
        // L'utilisateur doit avoir la permission de valider
        if (!this.userContext.permissions.canValidate) {
            return false;
        }
        
        // Le planning ne doit pas être déjà validé ou rejeté
        const status = this.planning.workflowStatus?.status;
        if (status === 'VALIDE' || status === 'REJETE') {
            return false;
        }
        
        // Super-admin et admin-gta peuvent valider tous les plannings
        if (this.userContext.roleNormalized === 'super-admin' || 
            this.userContext.roleNormalized === 'admin-gta') {
            return true;
        }
        
        // Vérifier le périmètre pour les autres rôles
        return this.isInUserPerimeter();
    }
    
    /**
     * Vérifie si c'est une validation finale (dernière étape)
     */
    get estValidationFinale(): boolean {
        if (!this.userContext || !this.planning) {
            return false;
        }
        
        const currentStep = this.planning.workflowStatus?.currentStepIndex ?? 0;
        const totalSteps = 4; // À ajuster selon la config du workflow
        
        return this.userContext.permissions.canValidateFinal && currentStep >= totalSteps - 1;
    }
    
    /**
     * Vérifie si le planning est dans le périmètre de l'utilisateur
     */
    private isInUserPerimeter(): boolean {
        if (!this.userContext || !this.planning) {
            return false;
        }
        
        // Chef de service : uniquement son service
        if (this.userContext.roleNormalized === 'chef-service') {
            return String(this.planning.serviceId) === String(this.userContext.serviceId);
        }
        
        // Chef de pôle : uniquement son pôle
        if (this.userContext.roleNormalized === 'chef-pole') {
            // Vérifier le poleId si disponible
            return true; // À affiner selon la structure des données
        }
        
        // Pour les autres rôles avec permission de valider
        return true;
    }

    onVoirDetails(): void {
        const planningId = this.getPlanningNumericId();
        this.router.navigate(['/workflow/validation', planningId]);
        this.voirDetails.emit(planningId);
    }

    onValider(): void {
        this.showApprobationModal = true;
    }

    onRejeter(): void {
        this.showRejetModal = true;
    }

    onDemanderModification(): void {
        this.showDemandeModal = true;
    }

    onApprobationConfirm(payload: ApprobationModalPayload): void {
        this.isSubmittingAction = true;
        this.valider.emit({
            planningId: this.getPlanningNumericId(),
            ...payload
        });
        this.showApprobationModal = false;
        this.isSubmittingAction = false;
    }

    onRejetConfirm(payload: RejetModalPayload): void {
        this.isSubmittingAction = true;
        this.rejeter.emit({
            planningId: this.getPlanningNumericId(),
            ...payload
        });
        this.showRejetModal = false;
        this.isSubmittingAction = false;
    }

    onDemandeConfirm(payload: DemandeModificationPayload): void {
        this.isSubmittingAction = true;
        this.demanderModification.emit({
            planningId: this.getPlanningNumericId(),
            ...payload
        });
        this.showDemandeModal = false;
        this.isSubmittingAction = false;
    }

    closeModals(): void {
        if (this.isSubmittingAction) {
            return;
        }

        this.showApprobationModal = false;
        this.showRejetModal = false;
        this.showDemandeModal = false;
    }

    private getPlanningNumericId(): number {
        const raw = this.planning?.id;
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
            return parsed;
        }

        const extracted = `${raw ?? ''}`.match(/(\d+)/g)?.join('');
        const fallback = extracted ? Number(extracted) : 0;
        return Number.isFinite(fallback) ? fallback : 0;
    }

    private getSubmissionHistory() {
        if (!this.planning?.history?.length) {
            return null;
        }

        return this.planning.history.find(item => item.action === 'SOUMISSION') || this.planning.history[0];
    }

    private getSubmissionDate(): Date | null {
        const submission = this.getSubmissionHistory();
        if (!submission?.at) {
            return null;
        }

        const parsed = new Date(submission.at);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    private getMemoizedRemainingHours(submissionDate: Date, maxDelayHours: number): number {
        const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
        const cacheKey = `${submissionDate.getTime()}-${maxDelayHours}-${hourBucket}`;
        const cached = this.remainingDelayCache.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const elapsedHours = (Date.now() - submissionDate.getTime()) / (1000 * 60 * 60);
        const remaining = Math.max(0, Math.floor(maxDelayHours - elapsedHours));
        this.remainingDelayCache.set(cacheKey, remaining);
        return remaining;
    }
}
