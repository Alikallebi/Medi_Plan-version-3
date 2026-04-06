import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { AuditTrailEvent, AuditTrailEventType } from '../../models';

@Component({
    selector: 'app-audit-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './audit-table.component.html',
    styleUrls: ['./audit-table.component.scss']
})
export class AuditTableComponent {
    @Input() events: AuditTrailEvent[] = [];
    @Input() loading = false;
    @Input() error: string | null = null;

    @Output() viewDetails = new EventEmitter<AuditTrailEvent>();

    isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

    @HostListener('window:resize')
    onResize(): void {
        this.isMobile = window.innerWidth < 768;
    }

    trackByEvent(index: number, event: AuditTrailEvent): number {
        return event.id ?? index;
    }

    getEventIcon(type: AuditTrailEventType): string {
        switch (type) {
            case 'PLANNING_CREATION':
                return '🆕';
            case 'PLANNING_MODIFICATION':
                return '✏️';
            case 'PLANNING_SOUMISSION':
                return '📤';
            case 'PLANNING_APPROBATION':
                return '✅';
            case 'PLANNING_REJET':
                return '❌';
            case 'COMMENTAIRE_AJOUT':
                return '💬';
            case 'WORKFLOW_CONFIG_MODIFICATION':
            case 'WORKFLOW_CONFIG_CREATION':
                return '⚙️';
            case 'CONNEXION':
                return '🔐';
            default:
                return '📌';
        }
    }

    getEventClass(type: AuditTrailEventType): string {
        if (type.includes('APPROBATION') || type.includes('CREATION')) {
            return 'ok';
        }
        if (type.includes('REJET')) {
            return 'ko';
        }
        if (type.includes('CONNEXION')) {
            return 'auth';
        }
        return 'neutral';
    }
}
