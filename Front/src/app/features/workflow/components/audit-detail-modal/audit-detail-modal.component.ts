import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuditTrailEvent } from '../../models';

@Component({
    selector: 'app-audit-detail-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './audit-detail-modal.component.html',
    styleUrls: ['./audit-detail-modal.component.scss']
})
export class AuditDetailModalComponent {
    @Input() event!: AuditTrailEvent;
    @Output() close = new EventEmitter<void>();

    get detailsPretty(): string {
        try {
            return JSON.stringify(this.event.details || {}, null, 2);
        } catch {
            return '{}';
        }
    }
}
