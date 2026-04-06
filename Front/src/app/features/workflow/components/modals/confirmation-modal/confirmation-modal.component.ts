import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
    selector: 'app-confirmation-modal',
    templateUrl: './confirmation-modal.component.html',
    styleUrls: ['./confirmation-modal.component.scss']
})
export class ConfirmationModalComponent {
    @Input() titre = '⚠️ CONFIRMER L\'ACTION';
    @Input() message = 'Êtes-vous sûr de vouloir continuer ?';
    @Input() type: 'danger' | 'warning' | 'info' = 'warning';
    @Input() isSubmitting = false;

    @Output() confirm = new EventEmitter<void>();
    @Output() cancel = new EventEmitter<void>();

    onConfirm(): void {
        if (this.isSubmitting) {
            return;
        }
        this.confirm.emit();
    }

    onCancel(): void {
        if (this.isSubmitting) {
            return;
        }
        this.cancel.emit();
    }
}
