import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PlanningWorkflow } from '../../models';

@Component({
    selector: 'app-planning-preview',
    templateUrl: './planning-preview.component.html',
    styleUrls: ['./planning-preview.component.scss']
})
export class PlanningPreviewComponent {
    @Input() planning: PlanningWorkflow | null = null;

    @Output() openPlanning = new EventEmitter<void>();
    @Output() exportPdf = new EventEmitter<void>();

    get assignmentCount(): number {
        return this.planning?.assignments?.length || 0;
    }

    onOpenPlanning(): void {
        this.openPlanning.emit();
    }

    onExportPdf(): void {
        this.exportPdf.emit();
    }
}
