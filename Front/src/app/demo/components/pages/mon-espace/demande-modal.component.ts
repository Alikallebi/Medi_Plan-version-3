import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { DemandeCreatePayload, DemandeType } from 'src/app/demo/models/demande.model';

interface DemandeFormState {
    date: string;
    type: DemandeType;
    heureDebut: string;
    heureFin: string;
    commentaire: string;
}

@Component({
    selector: 'app-demande-modal',
    templateUrl: './demande-modal.component.html',
    styleUrls: ['./demande-modal.component.scss']
})
export class DemandeModalComponent implements OnChanges {
    @Input() visible = false;
    @Input() loading = false;
    @Input() defaultDate = '';

    @Output() close = new EventEmitter<void>();
    @Output() submitDemande = new EventEmitter<DemandeCreatePayload>();

    readonly typeOptions: { value: DemandeType; label: string }[] = [
        { value: 'HS', label: 'Heures supplémentaires (HS)' },
        { value: 'RC+', label: 'Récupération positive (RC+)' },
        { value: 'RC-', label: 'Récupération négative (RC-)' },
        { value: 'ABSENCE', label: 'Absence' },
        { value: 'ARRET', label: 'Arrêt' }
    ];

    errorMessage = '';
    form: DemandeFormState = this.buildInitialState();

    ngOnChanges(changes: SimpleChanges): void {
        if ((changes['visible'] && this.visible) || changes['defaultDate']) {
            this.form = this.buildInitialState();
            this.errorMessage = '';
        }
    }

    closeModal(): void {
        if (this.loading) {
            return;
        }

        this.close.emit();
    }

    submit(): void {
        const validation = this.validate();
        if (!validation.ok) {
            this.errorMessage = validation.message;
            return;
        }

        this.errorMessage = '';
        this.submitDemande.emit({
            serviceId: 0,
            date: this.form.date,
            type: this.form.type,
            heureDebut: this.form.heureDebut,
            heureFin: this.form.heureFin,
            commentaire: this.form.commentaire?.trim() || undefined
        });
    }

    private validate(): { ok: boolean; message: string } {
        if (!this.form.date) {
            return { ok: false, message: 'La date de la demande est obligatoire.' };
        }

        if (!this.form.heureDebut || !this.form.heureFin) {
            return { ok: false, message: 'Les heures de début et de fin sont obligatoires.' };
        }

        if (this.form.heureDebut >= this.form.heureFin) {
            return { ok: false, message: 'L’heure de fin doit être supérieure à l’heure de début.' };
        }

        return { ok: true, message: '' };
    }

    private buildInitialState(): DemandeFormState {
        const today = new Date();
        const fallbackDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        return {
            date: this.defaultDate || fallbackDate,
            type: 'HS',
            heureDebut: '08:00',
            heureFin: '17:00',
            commentaire: ''
        };
    }
}