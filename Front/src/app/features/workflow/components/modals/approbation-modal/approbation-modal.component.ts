import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PlanningWorkflow } from '../../../models';

export interface ApprobationModalPayload {
    commentaire: string;
    notifierCreateur: boolean;
    notifierAutresValidateurs: boolean;
}

@Component({
    selector: 'app-approbation-modal',
    templateUrl: './approbation-modal.component.html',
    styleUrls: ['./approbation-modal.component.scss']
})
export class ApprobationModalComponent {
    @Input() planning!: PlanningWorkflow;
    @Input() etapeActuelle = 1;
    @Input() isSubmitting = false;

    @Output() confirm = new EventEmitter<ApprobationModalPayload>();
    @Output() cancel = new EventEmitter<void>();

    commentaire = '';
    notifierCreateur = true;
    notifierAutresValidateurs = false;

    onConfirm(): void {
        if (this.isSubmitting) {
            return;
        }

        this.confirm.emit({
            commentaire: this.commentaire.trim(),
            notifierCreateur: this.notifierCreateur,
            notifierAutresValidateurs: this.notifierAutresValidateurs
        });
    }

    onCancel(): void {
        if (this.isSubmitting) {
            return;
        }
        this.cancel.emit();
    }
}
