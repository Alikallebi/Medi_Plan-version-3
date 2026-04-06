import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PlanningWorkflow } from '../../../models';

export interface RejetModalPayload {
    motif: string;
    commentaire: string;
    dateLimite?: Date;
}

@Component({
    selector: 'app-rejet-modal',
    templateUrl: './rejet-modal.component.html',
    styleUrls: ['./rejet-modal.component.scss']
})
export class RejetModalComponent {
    @Input() planning!: PlanningWorkflow;
    @Input() isSubmitting = false;

    @Output() confirm = new EventEmitter<RejetModalPayload>();
    @Output() cancel = new EventEmitter<void>();

    motif = '';
    autreMotif = '';
    commentaire = '';
    dateLimite?: string;

    readonly motifs = [
        'Effectifs insuffisants',
        'Non-respect des repos de sécurité',
        'Conflits horaires détectés',
        'Compétences manquantes',
        'À revoir avec l\'équipe',
        'Autre'
    ];

    get isAutreMotif(): boolean {
        return this.motif === 'Autre';
    }

    get isFormValid(): boolean {
        const finalMotif = this.isAutreMotif ? this.autreMotif.trim() : this.motif.trim();
        return finalMotif.length > 0 && this.commentaire.trim().length > 0;
    }

    onConfirm(): void {
        if (!this.isFormValid || this.isSubmitting) {
            return;
        }

        const finalMotif = this.isAutreMotif ? this.autreMotif.trim() : this.motif.trim();
        this.confirm.emit({
            motif: finalMotif,
            commentaire: this.commentaire.trim(),
            dateLimite: this.dateLimite ? new Date(this.dateLimite) : undefined
        });
    }

    onCancel(): void {
        if (this.isSubmitting) {
            return;
        }
        this.cancel.emit();
    }
}
