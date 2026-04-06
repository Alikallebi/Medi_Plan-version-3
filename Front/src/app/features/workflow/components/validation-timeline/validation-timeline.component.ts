import { Component, Input } from '@angular/core';
import { ValidationHistoryItem, WorkflowEtape } from '../../models';

@Component({
    selector: 'app-validation-timeline',
    templateUrl: './validation-timeline.component.html',
    styleUrls: ['./validation-timeline.component.scss']
})
export class ValidationTimelineComponent {
    @Input() historique: ValidationHistoryItem[] = [];
    @Input() etapes: WorkflowEtape[] = [];
    @Input() etapeActuelle = 1;

    get historiqueTries(): ValidationHistoryItem[] {
        return [...this.historique].sort((a, b) => {
            const aTime = new Date(a.createdAt).getTime();
            const bTime = new Date(b.createdAt).getTime();
            return bTime - aTime;
        });
    }

    get etapesAvenir(): WorkflowEtape[] {
        return this.etapes.filter(etape => etape.order > this.etapeActuelle && etape.isActive);
    }

    get delaiRestant(): string | null {
        const etape = this.etapes.find(item => item.order === this.etapeActuelle);
        if (!etape?.maxDelayHours) {
            return null;
        }

        return `${etape.maxDelayHours}h`;
    }

    getIcon(event: ValidationHistoryItem): string {
        switch (event.action) {
            case 'APPROBATION':
                return '✅';
            case 'REJET':
                return '❌';
            case 'RETOUR_CORRECTION':
                return '✏️';
            case 'REASSIGNATION':
                return '🔁';
            default:
                return '📝';
        }
    }

    getIconClass(event: ValidationHistoryItem): string {
        switch (event.action) {
            case 'APPROBATION':
                return 'success';
            case 'REJET':
                return 'danger';
            case 'RETOUR_CORRECTION':
                return 'info';
            case 'REASSIGNATION':
                return 'muted';
            default:
                return 'pending';
        }
    }

    getActionLabel(action: ValidationHistoryItem['action']): string {
        switch (action) {
            case 'APPROBATION':
                return 'Étape validée';
            case 'REJET':
                return 'Planning rejeté';
            case 'RETOUR_CORRECTION':
                return 'Demande de modification';
            case 'REASSIGNATION':
                return 'Réassignation';
            default:
                return 'Soumission';
        }
    }

    getValidateurActuel(): string {
        const etape = this.etapes.find(item => item.order === this.etapeActuelle);
        if (!etape) {
            return 'Validateur non défini';
        }

        return etape.validatorUserId || this.getRoleName(etape.validatorRole);
    }

    getRoleName(role: string): string {
        const roleMap: Record<string, string> = {
            SUPER_ADMIN: 'Super Admin',
            ADMIN_GTA: 'Admin GTA',
            CHEF_SERVICE: 'Chef de service',
            CHEF_POLE: 'Chef de pôle',
            VALIDATEUR_RH: 'Validateur RH',
            PLANIFICATEUR_URGENCE: 'Planificateur urgence',
            SUPERVISEUR_INTERNES: 'Superviseur internes',
            STAFF: 'Staff'
        };

        return roleMap[role] || role;
    }
}
