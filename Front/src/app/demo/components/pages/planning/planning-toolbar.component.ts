import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
    selector: 'app-planning-toolbar',
    templateUrl: './planning-toolbar.component.html',
    styleUrls: ['./planning-toolbar.component.css']
})
export class PlanningToolbarComponent {
    @Input() weekLabel = '';
    @Input() currentView: 'hebdomadaire' | 'journaliere' | 'mensuelle' = 'hebdomadaire';
    @Input() currentFilter: 'all' | 'medecin' | 'infirmier' | 'vacant' = 'all';
    @Input() loading = false;
    @Input() workflowStatus: string | null = null;  // statut actuel du workflow
    @Input() userCanValidate = false;  // Chef de Pôle, Validateur RH, Admin
    @Input() userCanSubmit = false;    // Chef de Service, Admin

    @Output() previousWeek = new EventEmitter<void>();
    @Output() nextWeek = new EventEmitter<void>();
    @Output() goToday = new EventEmitter<void>();
    @Output() viewChanged = new EventEmitter<'hebdomadaire' | 'journaliere' | 'mensuelle'>();
    @Output() filterChanged = new EventEmitter<'all' | 'medecin' | 'infirmier' | 'vacant'>();
    @Output() exportPlanning = new EventEmitter<'pdf' | 'excel' | 'csv'>();
    @Output() validatePlanning = new EventEmitter<void>();
    @Output() submitForValidation = new EventEmitter<void>();

    /** Peut-on soumettre ? Seulement en brouillon ou si non soumis */
    get canSubmit(): boolean {
        return !this.loading && (
            !this.workflowStatus ||
            this.workflowStatus === 'BROUILLON' ||
            this.workflowStatus === 'REJETE'
        );
    }

    get submitLabel(): string {
        if (this.workflowStatus === 'EN_ATTENTE_VALIDATION') return '⏳ En attente';
        if (this.workflowStatus === 'EN_ATTENTE_VALIDATION_FINALE') return '🔍 Validation finale';
        if (this.workflowStatus === 'VALIDE') return '✅ Validé';
        if (this.workflowStatus === 'REJETE') return '📤 Re-soumettre';
        return '📤 Soumettre';
    }
}
