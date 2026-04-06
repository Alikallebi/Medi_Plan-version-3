import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../../demo/service/auth.service';
import { UserContext } from '../../models/user-context.model';
import { AttachmentService, WorkflowAttachment } from '../../services/attachment.service';
import { PlanningWorkflow, ValidationHistoryItem, ValidationStatus, WorkflowEtape } from '../../models';
import { NotificationService } from '../../services/notification.service';
import { AddWorkflowCommentPayload, WorkflowComment, WorkflowService } from '../../services/workflow.service';
import { CommentSubmitEvent } from '../comment-section/comment-section.component';
import { ApprobationModalPayload } from '../modals/approbation-modal/approbation-modal.component';
import { DemandeModificationPayload } from '../modals/demande-modification-modal/demande-modification-modal.component';
import { RejetModalPayload } from '../modals/rejet-modal/rejet-modal.component';
import { WORKFLOW_MESSAGES } from '../../constants/messages';

@Component({
    selector: 'app-validation-detail',
    templateUrl: './validation-detail.component.html',
    styleUrls: ['./validation-detail.component.scss']
})
export class ValidationDetailComponent implements OnInit, OnDestroy {
    planning: PlanningWorkflow | null = null;
    validationStatus: ValidationStatus | null = null;
    historique: ValidationHistoryItem[] = [];
    etapes: WorkflowEtape[] = [];
    comments: WorkflowComment[] = [];
    attachments: WorkflowAttachment[] = [];

    userContext: UserContext | null = null;
    private destroy$ = new Subject<void>();

    isLoading = false;
    isActionLoading = false;
    hasError = false;
    errorMessage = '';
    isCommentsLoading = false;
    commentsHasError = false;
    commentsErrorMessage = '';
    isCommentSubmitting = false;

    isAttachmentsLoading = false;
    attachmentsHasError = false;
    attachmentsErrorMessage = '';
    isAttachmentUploading = false;

    actionComment = '';

    showApprobationModal = false;
    showRejetModal = false;
    showDemandeModal = false;
    showPlanningModal = false;
    isReadOnlyMode = false;

    constructor(
        private readonly route: ActivatedRoute,
        private readonly router: Router,
        private readonly workflowService: WorkflowService,
        private readonly notification: NotificationService,
        private readonly attachmentService: AttachmentService,
        private readonly authService: AuthService
    ) {}

    ngOnInit(): void {
        this.isReadOnlyMode = this.route.snapshot.queryParamMap.get('mode') === 'suivi';

        this.authService.userContext$
            .pipe(takeUntil(this.destroy$))
            .subscribe(context => {
                this.userContext = context;
            });

        const id = this.route.snapshot.paramMap.get('id');
        if (!id) {
            this.setError('Identifiant de planning invalide.');
            return;
        }

        this.loadPlanning(id);
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    get planningTitle(): string {
        if (!this.planning) {
            return 'Planning';
        }

        const start = this.toDate(this.planning.weekStart);
        const periodLabel = start
            ? start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
            : 'Période';

        return `PLANNING ${periodLabel.toUpperCase()} - ${this.planning.serviceName}`;
    }

    get etapeActuelle(): number {
        if (!this.validationStatus) {
            return 1;
        }

        return Math.max(1, this.validationStatus.currentStepIndex + 1);
    }

    get canAct(): boolean {
        if (this.isReadOnlyMode) {
            return false;
        }

        if (!this.userContext || !this.planning) {
            return false;
        }

        if (!this.userContext.permissions.canValidate) {
            return false;
        }

        const status = this.validationStatus?.status;
        if (status === 'VALIDE' || status === 'REJETE') {
            return false;
        }

        const currentUserId = this.getCurrentUserId();
        const nextValidatorId = this.getNextValidatorId();
        if (nextValidatorId !== null && currentUserId !== null && nextValidatorId !== currentUserId) {
            return false;
        }

        const roleNormalized = this.userContext.roleNormalized;
        if (roleNormalized === 'super-admin' || roleNormalized === 'admin-gta') {
            return true;
        }

        return this.isInUserPerimeter();
    }

    get peutCommenter(): boolean {
        return !!this.userContext?.permissions.canComment;
    }

    get peutJoindreFichiers(): boolean {
        return !!this.userContext?.permissions.canAttachFiles;
    }

    private isInUserPerimeter(): boolean {
        if (!this.userContext || !this.planning) {
            return false;
        }

        const role = this.userContext.roleNormalized;

        if (role === 'chef-service') {
            return String(this.planning.serviceId) === String(this.userContext.serviceId);
        }

        if (role === 'chef-pole' || role === 'validateur-rh' || role === 'planificateur-rh' || role === 'planificateur-urgence' || role === 'superviseur-internes') {
            // Pour ces rôles, permettre l'accès pour l'instant
            // TODO: Ajouter les propriétés manquantes au modèle PlanningWorkflow (poleId, serviceType, type)
            return true;
        }

        return false;
    }

    private getCurrentUserId(): number | null {
        const raw = this.userContext?.id ?? localStorage.getItem('idUser');
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    private getNextValidatorId(): number | null {
        const raw = (this.planning as any)?.prochainValidateurId;
        if (raw === null || raw === undefined || raw === '') {
            return null;
        }

        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    get createdByLabel(): string {
        const firstHistory = this.planning?.history?.[0];
        return firstHistory?.author || '—';
    }

    get createdAtLabel(): string {
        const firstHistory = this.planning?.history?.[0];
        const date = this.toDate(firstHistory?.at);
        return date ? date.toLocaleDateString('fr-FR') : '—';
    }

    get statusLabel(): string {
        const status = this.validationStatus?.status;
        switch (status) {
            case 'EN_ATTENTE_N1':
                return `⏳ En attente de validation (Étape ${this.etapeActuelle}/${this.totalEtapes})`;
            case 'EN_ATTENTE_N2':
                return `⏳ En attente RH/Supervision (Étape ${this.etapeActuelle}/${this.totalEtapes})`;
            case 'VALIDE':
                return '✅ Planning validé';
            case 'REJETE':
                return '❌ Planning rejeté';
            case 'BROUILLON':
            default:
                return '📝 Brouillon';
        }
    }

    get totalEtapes(): number {
        return this.etapes.length > 0 ? this.etapes.length : 4;
    }

    get derniereActionLabel(): string {
        const lastEvent = this.historique[0];
        if (!lastEvent) {
            return 'Aucune action enregistrée';
        }

        const date = this.toDate(lastEvent.createdAt)?.toLocaleString('fr-FR') || 'Date inconnue';
        return `${date} par ${lastEvent.actorUserId} (${this.mapActionLabel(lastEvent.action)})`;
    }

    loadPlanning(id: string): void {
        this.isLoading = true;
        this.hasError = false;

        this.workflowService.getPlanningWithWorkflow(id).subscribe({
            next: (data) => {
                this.planning = data.planning;
                this.validationStatus = data.validationStatus;
                this.historique = (data.historique || []).slice().sort((a, b) => {
                    const aDate = this.toDate(a.createdAt)?.getTime() || 0;
                    const bDate = this.toDate(b.createdAt)?.getTime() || 0;
                    return bDate - aDate;
                });
                this.etapes = (data.etapes || []).slice().sort((a, b) => a.order - b.order);
                this.isLoading = false;
                this.loadCommentsAndAttachments();
            },
            error: () => {
                this.setError('Erreur lors du chargement du détail de validation.');
            }
        });
    }

    retryLoad(): void {
        const id = this.route.snapshot.paramMap.get('id');
        if (!id) {
            this.setError('Identifiant de planning invalide.');
            return;
        }

        this.loadPlanning(id);
    }

    retourInbox(): void {
        if (this.isReadOnlyMode) {
            this.router.navigate(['/workflow/mes-soumissions']);
            return;
        }

        this.router.navigate(['/workflow/validation-inbox']);
    }

    get backLinkLabel(): string {
        return this.isReadOnlyMode
            ? '◀ Retour à mes soumissions'
            : '◀ Retour aux validations en attente';
    }

    ouvrirModalApprobation(): void {
        if (!this.canAct || this.isActionLoading) {
            return;
        }
        this.showApprobationModal = true;
    }

    ouvrirModalRejet(): void {
        if (!this.canAct || this.isActionLoading) {
            return;
        }
        this.showRejetModal = true;
    }

    ouvrirModalDemandeModification(): void {
        if (!this.canAct || this.isActionLoading) {
            return;
        }
        this.showDemandeModal = true;
    }

    onApprobationConfirm(payload: ApprobationModalPayload): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            this.notification.error('Impossible d’approuver ce planning (ID invalide).');
            return;
        }

        this.isActionLoading = true;
        const commentaire = (payload.commentaire || this.actionComment || '').trim();

        this.workflowService.approuverEtape(
            planningId,
            commentaire,
            payload.notifierCreateur,
            payload.notifierAutresValidateurs
        ).subscribe({
            next: () => {
                this.notification.success(WORKFLOW_MESSAGES.SUCCESS.APPROBATION);
                this.isActionLoading = false;
                this.closeModals();
                this.actionComment = '';
                this.loadPlanning(`${planningId}`);
            },
            error: () => {
                this.notification.error(WORKFLOW_MESSAGES.ERROR.VALIDATION);
                this.isActionLoading = false;
            }
        });
    }

    onRejetConfirm(payload: RejetModalPayload): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            this.notification.error('Impossible de rejeter ce planning (ID invalide).');
            return;
        }

        this.isActionLoading = true;

        this.workflowService.rejeterPlanning(planningId, payload.motif, payload.commentaire).subscribe({
            next: () => {
                this.notification.warning(WORKFLOW_MESSAGES.SUCCESS.REJET);
                this.isActionLoading = false;
                this.closeModals();
                this.loadPlanning(`${planningId}`);
            },
            error: () => {
                this.notification.error('Erreur lors du rejet');
                this.isActionLoading = false;
            }
        });
    }

    onDemandeConfirm(payload: DemandeModificationPayload): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            this.notification.error('Impossible de demander une modification (ID invalide).');
            return;
        }

        this.isActionLoading = true;

        this.workflowService.demanderModification(planningId, payload.instructions).subscribe({
            next: () => {
                this.notification.info('Demande de modification envoyée');
                this.isActionLoading = false;
                this.closeModals();
                this.loadPlanning(`${planningId}`);
            },
            error: () => {
                this.notification.error('Erreur lors de la demande de modification');
                this.isActionLoading = false;
            }
        });
    }

    closeModals(): void {
        if (this.isActionLoading) {
            return;
        }

        this.showApprobationModal = false;
        this.showRejetModal = false;
        this.showDemandeModal = false;
    }

    ouvrirPlanningComplet(): void {
        this.showPlanningModal = true;
    }

    fermerPlanningModal(): void {
        this.showPlanningModal = false;
    }

    readonly planningModalDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    planningModalDayDateLabel(dayIndex: number): string {
        if (!this.planning?.weekStart || dayIndex < 0) {
            return '';
        }

        const date = new Date(this.planning.weekStart);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + dayIndex);
        return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }

    private readonly avatarPalette = [
        'linear-gradient(135deg, #3b82f6, #6366f1)',
        'linear-gradient(135deg, #10b981, #059669)',
        'linear-gradient(135deg, #f59e0b, #d97706)',
        'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        'linear-gradient(135deg, #ef4444, #dc2626)',
        'linear-gradient(135deg, #06b6d4, #0891b2)',
        'linear-gradient(135deg, #ec4899, #db2777)',
        'linear-gradient(135deg, #14b8a6, #0d9488)',
    ];

    /** Lignes du planning modal : une ligne par personnel, avec ses affectations par jour */
    get planningModalRows(): { id: string; nom: string; prenom: string; initials: string; avatarColor: string; assignments: (any | null)[] }[] {
        const personnel = (this.planning as any)?.personnel as { id: string; nom: string; prenom: string }[] | undefined;
        const assignments = this.planning?.assignments || [];

        const seen = new Set<string>();
        const rows: { id: string; nom: string; prenom: string; initials: string; avatarColor: string; assignments: (any | null)[] }[] = [];

        assignments.forEach((a: any) => {
            if (!seen.has(String(a.personnelId))) {
                seen.add(String(a.personnelId));
                const found = personnel?.find(p => String(p.id) === String(a.personnelId));
                const nom    = found?.nom    ?? '';
                const prenom = found?.prenom ?? '';
                const initials = ((prenom[0] ?? '') + (nom[0] ?? '')).toUpperCase() || '?';
                const avatarColor = this.avatarPalette[rows.length % this.avatarPalette.length];
                rows.push({ id: String(a.personnelId), nom, prenom, initials, avatarColor, assignments: Array(7).fill(null) });
            }
        });

        assignments.forEach((a: any) => {
            const row = rows.find(r => r.id === String(a.personnelId));
            if (row && a.day >= 0 && a.day <= 6) {
                row.assignments[a.day] = a;
            }
        });

        return rows;
    }

    get planningModalWeekLabel(): string {
        if (!this.planning?.weekStart) { return ''; }
        const d = new Date(this.planning.weekStart);
        const end = new Date(d);
        end.setDate(end.getDate() + 6);
        const fmt = (dt: Date) => dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `${fmt(d)} au ${fmt(end)}`;
    }

    get planningModalStatusClass(): string {
        const s = this.planning?.workflowStatus as string | undefined;
        if (s === 'VALIDE') { return 'badge-valide'; }
        if (s === 'REJETE') { return 'badge-rejete'; }
        if (s === 'EN_ATTENTE_VALIDATION' || s === 'EN_ATTENTE_VALIDATION_RH') { return 'badge-attente'; }
        return 'badge-brouillon';
    }

    getPersonnelName(personnelId: string): string {
        const personnel = (this.planning as any)?.personnel as { id: string; nom: string; prenom: string }[] | undefined;
        const found = personnel?.find(p => String(p.id) === String(personnelId));
        if (!found) { return personnelId; }
        return `${found.prenom ?? ''} ${found.nom ?? ''}`.trim() || personnelId;
    }

    shiftLabel(shiftType: string): string {
        const map: Record<string, string> = {
            jour: 'Jour', nuit: 'Nuit', garde: 'Garde',
            astreinte: 'Astreinte', conges: 'Congés', formation: 'Formation'
        };
        return map[shiftType] ?? shiftType;
    }

    shiftIcon(shiftType: string): string {
        const icons: Record<string, string> = {
            jour: '☀️', nuit: '🌙', garde: '🏥',
            astreinte: '📟', conges: '🌴', formation: '📚'
        };
        return icons[shiftType] ?? '📋';
    }

    exporterPdf(): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            this.notification.error('Export impossible (ID invalide).');
            return;
        }

        this.workflowService.exportAudit('pdf', planningId).subscribe({
            next: (blob) => {
                const url = window.URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `planning-${planningId}-audit.pdf`;
                anchor.click();
                window.URL.revokeObjectURL(url);
            },
            error: () => {
                this.notification.error('Erreur lors de l’export PDF');
            }
        });
    }

    onRetryComments(): void {
        this.loadComments();
    }

    onRetryAttachments(): void {
        this.loadAttachments();
    }

    onSubmitComment(event: CommentSubmitEvent): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            this.notification.error('Ajout commentaire impossible (ID invalide).');
            return;
        }

        const linkedAttachments = this.attachments
            .filter(item => event.selectedAttachmentIds.includes(item.id))
            .map(item => ({
                id: item.id,
                fileName: item.fileName,
                fileType: item.fileType,
                size: item.size,
                uploadedAt: item.uploadedAt,
                uploadedBy: item.uploadedBy
            }));

        const payload: AddWorkflowCommentPayload = {
            message: event.message,
            etapeOrdre: this.etapeActuelle,
            attachments: linkedAttachments
        };

        this.isCommentSubmitting = true;
        this.workflowService.addPlanningComment(planningId, payload).subscribe({
            next: (comment) => {
                this.comments = [comment, ...this.comments];
                this.isCommentSubmitting = false;
                this.notification.success('Commentaire ajouté');
            },
            error: () => {
                this.isCommentSubmitting = false;
                this.notification.error('Erreur lors de l’ajout du commentaire');
            }
        });
    }

    onUploadFiles(files: File[]): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0 || files.length === 0) {
            return;
        }

        this.isAttachmentUploading = true;
        const uploads = files.map(file => this.attachmentService.uploadAttachment(planningId, file));
        forkJoin(uploads).subscribe({
            next: (uploaded) => {
                const merged = [...uploaded, ...this.attachments];
                this.attachments = this.deduplicateAttachments(merged);
                this.isAttachmentUploading = false;
                this.notification.success('Fichier(s) ajouté(s)');
            },
            error: () => {
                this.isAttachmentUploading = false;
                this.notification.error('Erreur lors de l’upload de fichier');
            }
        });
    }

    onRemoveAttachment(attachmentId: string): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            return;
        }

        this.attachmentService.deleteAttachment(planningId, attachmentId).subscribe({
            next: () => {
                this.attachments = this.attachments.filter(item => item.id !== attachmentId);
                this.notification.info('Pièce jointe supprimée');
            },
            error: () => {
                this.notification.error('Erreur lors de la suppression du document');
            }
        });
    }

    private loadCommentsAndAttachments(): void {
        this.loadComments();
        this.loadAttachments();
    }

    private loadComments(): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            this.comments = [];
            return;
        }

        this.isCommentsLoading = true;
        this.commentsHasError = false;
        this.workflowService.getPlanningComments(planningId).subscribe({
            next: (items) => {
                this.comments = (items || []).slice().sort((a, b) => {
                    const aTime = this.toDate(a.createdAt)?.getTime() || 0;
                    const bTime = this.toDate(b.createdAt)?.getTime() || 0;
                    return bTime - aTime;
                });
                this.isCommentsLoading = false;
            },
            error: () => {
                this.commentsHasError = true;
                this.commentsErrorMessage = 'Impossible de charger les commentaires.';
                this.isCommentsLoading = false;
            }
        });
    }

    private loadAttachments(): void {
        const planningId = this.getPlanningNumericId();
        if (planningId <= 0) {
            this.attachments = [];
            return;
        }

        this.isAttachmentsLoading = true;
        this.attachmentsHasError = false;
        this.attachmentService.getAttachments(planningId).subscribe({
            next: (items) => {
                this.attachments = this.deduplicateAttachments(items || []).sort((a, b) => {
                    const aTime = this.toDate(a.uploadedAt)?.getTime() || 0;
                    const bTime = this.toDate(b.uploadedAt)?.getTime() || 0;
                    return bTime - aTime;
                });
                this.isAttachmentsLoading = false;
            },
            error: () => {
                this.attachmentsHasError = true;
                this.attachmentsErrorMessage = 'Impossible de charger les pièces jointes.';
                this.isAttachmentsLoading = false;
            }
        });
    }

    private deduplicateAttachments(items: WorkflowAttachment[]): WorkflowAttachment[] {
        const byId = new Map<string, WorkflowAttachment>();
        items.forEach(item => byId.set(item.id, item));
        return Array.from(byId.values());
    }

    private getPlanningNumericId(): number {
        const id = this.planning?.id;
        const parsed = Number(id);
        if (Number.isFinite(parsed)) {
            return parsed;
        }

        const extracted = `${id ?? ''}`.match(/(\d+)/g)?.join('');
        const fallback = extracted ? Number(extracted) : 0;
        return Number.isFinite(fallback) ? fallback : 0;
    }

    private toDate(value: string | Date | null | undefined): Date | null {
        if (!value) {
            return null;
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    private setError(message: string): void {
        this.hasError = true;
        this.errorMessage = message;
        this.isLoading = false;
    }

    private mapActionLabel(action: ValidationHistoryItem['action']): string {
        switch (action) {
            case 'APPROBATION':
                return 'approbation';
            case 'REJET':
                return 'rejet';
            case 'RETOUR_CORRECTION':
                return 'demande de modification';
            case 'REASSIGNATION':
                return 'réassignation';
            default:
                return 'soumission';
        }
    }
}
