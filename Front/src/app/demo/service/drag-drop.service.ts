import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DragPlanningItem, DropTargetCell, PlanningData, ValidationResult } from '../api/planning.models';
import { RuleValidationService } from './rule-validation.service';

@Injectable({
    providedIn: 'root'
})
export class DragDropService {
    private readonly draggingItemSubject = new BehaviorSubject<DragPlanningItem | null>(null);
    readonly draggingItem$ = this.draggingItemSubject.asObservable();

    constructor(private readonly ruleValidationService: RuleValidationService) {}

    startDrag(item: DragPlanningItem): void {
        this.draggingItemSubject.next(item);
    }

    clearDrag(): void {
        this.draggingItemSubject.next(null);
    }

    get currentDragItem(): DragPlanningItem | null {
        return this.draggingItemSubject.value;
    }

    validateDrop(dragItem: DragPlanningItem, targetCell: DropTargetCell, planning: PlanningData): ValidationResult {
        const targetPersonnelId = targetCell.personnelId;
        const assignmentId = dragItem.assignmentId || `new-${targetPersonnelId}-${targetCell.day}`;

        return this.ruleValidationService.validateAssignment(
            {
                id: assignmentId,
                personnelId: targetPersonnelId,
                day: targetCell.day,
                shiftType: dragItem.shiftType
            },
            planning
        );
    }
}
