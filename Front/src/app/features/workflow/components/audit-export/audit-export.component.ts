import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditExportRequest } from '../../models';

@Component({
    selector: 'app-audit-export',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './audit-export.component.html',
    styleUrls: ['./audit-export.component.scss']
})
export class AuditExportComponent {
    @Output() exportRequest = new EventEmitter<AuditExportRequest>();

    format: AuditExportRequest['format'] = 'pdf';
    scope: AuditExportRequest['scope'] = 'all';
    lastDays = 30;
    includePlanning = true;
    includeUser = true;

    onExport(): void {
        this.exportRequest.emit({
            format: this.format,
            scope: this.scope,
            lastDays: this.lastDays,
            includePlanning: this.includePlanning,
            includeUser: this.includeUser
        });
    }
}
