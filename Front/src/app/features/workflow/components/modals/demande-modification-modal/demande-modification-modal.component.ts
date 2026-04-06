import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PlanningWorkflow } from '../../../models';

export interface DemandeModificationPayload {
    instructions: string;
    priorite: 'normale' | 'urgente';
    dateRetour?: Date;
    notifierCreateur: boolean;
}

@Component({
    selector: 'app-demande-modification-modal',
    templateUrl: './demande-modification-modal.component.html',
    styleUrls: ['./demande-modification-modal.component.scss']
})
export class DemandeModificationModalComponent {
    @Input() planning!: PlanningWorkflow;
    @Input() isSubmitting = false;

    @Output() confirm = new EventEmitter<DemandeModificationPayload>();
    @Output() cancel = new EventEmitter<void>();

    instructions = '';
    priorite: 'normale' | 'urgente' = 'normale';
    dateRetour?: string;
    notifierCreateur = true;

    get isFormValid(): boolean {
        return this.instructions.trim().length > 0;
    }

    onConfirm(): void {
        if (!this.isFormValid || this.isSubmitting) {
            return;
        }

        this.confirm.emit({
            instructions: this.instructions.trim(),
            priorite: this.priorite,
            dateRetour: this.dateRetour ? new Date(this.dateRetour) : undefined,
            notifierCreateur: this.notifierCreateur
        });
    }

    onCancel(): void {
        if (this.isSubmitting) {
            return;
        }
        this.cancel.emit();
    }
}
