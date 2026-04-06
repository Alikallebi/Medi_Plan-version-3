import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditTrailEventType, AuditTrailFilter } from '../../models';

@Component({
    selector: 'app-audit-filters',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './audit-filters.component.html',
    styleUrls: ['./audit-filters.component.scss']
})
export class AuditFiltersComponent {
    @Input() filters: AuditTrailFilter = {};
    @Output() filtersChange = new EventEmitter<AuditTrailFilter>();
    @Output() reset = new EventEmitter<void>();

    localFilters: AuditTrailFilter = {};

    readonly typeOptions: { label: string; value: AuditTrailEventType }[] = [
        { label: 'Création', value: 'PLANNING_CREATION' },
        { label: 'Modification', value: 'PLANNING_MODIFICATION' },
        { label: 'Soumission', value: 'PLANNING_SOUMISSION' },
        { label: 'Approbation', value: 'PLANNING_APPROBATION' },
        { label: 'Rejet', value: 'PLANNING_REJET' },
        { label: 'Commentaire', value: 'COMMENTAIRE_AJOUT' },
        { label: 'Version', value: 'VERSION_CREATION' },
        { label: 'Connexion', value: 'CONNEXION' },
        { label: 'Export', value: 'EXPORT' },
        { label: 'Configuration', value: 'WORKFLOW_CONFIG_MODIFICATION' }
    ];

    ngOnChanges(): void {
        this.localFilters = {
            ...this.filters,
            typeEvenement: [...(this.filters.typeEvenement || [])]
        };
    }

    apply(): void {
        this.filtersChange.emit({ ...this.localFilters });
    }

    resetFilters(): void {
        this.localFilters = {};
        this.reset.emit();
    }

    toggleType(type: AuditTrailEventType, checked: boolean): void {
        const list = [...(this.localFilters.typeEvenement || [])];
        if (checked && !list.includes(type)) {
            this.localFilters.typeEvenement = [...list, type];
            return;
        }

        this.localFilters.typeEvenement = list.filter(item => item !== type);
    }
}
