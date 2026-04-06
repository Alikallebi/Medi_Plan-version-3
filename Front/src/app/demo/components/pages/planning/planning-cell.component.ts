import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Assignment, Conflict, DragPlanningItem, DropTargetCell, Personnel } from 'src/app/demo/api/planning.models';

interface AssignmentPeriodGroup {
    key: 'matin' | 'apresMidi' | 'nuit' | 'autres';
    label: string;
    icon: string;
    assignments: Assignment[];
}

@Component({
    selector: 'app-planning-cell',
    templateUrl: './planning-cell.component.html',
    styleUrls: ['./planning-cell.component.css']
})
export class PlanningCellComponent {
    @Input() personnel!: Personnel;
    @Input() dayIndex!: number;
    @Input() dayDate!: Date;
    @Input() assignment: Assignment | null = null;
    @Input() assignments: Assignment[] = [];
    @Input() hasConflict = false;
    @Input() conflict: Conflict | null = null;
    @Input() selected = false;
    @Input() dropValidator: ((drag: DragPlanningItem, target: DropTargetCell) => boolean) | null = null;

    @Output() dropped = new EventEmitter<{ dragData: DragPlanningItem; targetData: DropTargetCell }>();
    @Output() clicked = new EventEmitter<{ personnelId: string; day: number }>();
    @Output() contextMenuAction = new EventEmitter<{ personnelId: string; day: number; event: MouseEvent }>();
    @Output() selectionStart = new EventEmitter<{ personnelId: string; day: number }>();
    @Output() selectionEnter = new EventEmitter<{ personnelId: string; day: number }>();
    @Output() selectionEnd = new EventEmitter<void>();

    get dropData(): DropTargetCell {
        return {
            personnelId: this.personnel.id,
            day: this.dayIndex
        };
    }

    get assignmentList(): Assignment[] {
        if (this.assignments?.length) {
            return this.sortAssignmentsByPeriod(this.assignments);
        }
        return this.assignment ? [this.assignment] : [];
    }

    get visibleAssignments(): Assignment[] {
        return this.assignmentList.slice(0, 2);
    }

    get extraAssignmentsCount(): number {
        return Math.max(this.assignmentList.length - this.visibleAssignments.length, 0);
    }

    get hasAssignments(): boolean {
        return this.assignmentList.length > 0;
    }

    get groupedAssignments(): AssignmentPeriodGroup[] {
        const groups: AssignmentPeriodGroup[] = [
            { key: 'matin', label: 'Matin', icon: '🌞', assignments: [] },
            { key: 'apresMidi', label: 'Après-midi', icon: '🌤️', assignments: [] },
            { key: 'nuit', label: 'Nuit', icon: '🌙', assignments: [] },
            { key: 'autres', label: 'Autres', icon: '🩺', assignments: [] }
        ];

        for (const item of this.assignmentList) {
            const key = this.getAssignmentPeriodKey(item);
            const group = groups.find(g => g.key === key);
            if (group) {
                group.assignments.push(item);
            }
        }

        return groups.filter(group => group.assignments.length > 0);
    }

    toDragItem(item: Assignment): DragPlanningItem {
        return {
            source: 'planning',
            personnelId: item.personnelId,
            shiftType: item.shiftType,
            assignmentId: item.id,
            posteId: item.posteId,
            posteLabel: item.posteLabel,
            startTime: item.startTime,
            endTime: item.endTime
        };
    }

    get shiftLabel(): string {
        if (!this.assignment) {
            return '';
        }

        const map: Record<string, string> = {
            jour: 'Jour',
            nuit: 'Nuit',
            garde: 'Garde',
            astreinte: 'Astreinte',
            repos: 'Congé / Repos',
            conges: 'Congés',
            formation: 'Formation'
        };

        return map[this.assignment.shiftType] || this.assignment.shiftType;
    }

    get compactLine(): string {
        if (!this.assignment) {
            return '';
        }

        const explicitLabel = (this.assignment.posteLabel || '').trim();
        if (explicitLabel.length > 0 && !this.assignment.startTime && !this.assignment.endTime) {
            return explicitLabel;
        }

        const timeRange = this.assignment.startTime && this.assignment.endTime
            ? `${this.assignment.startTime}-${this.assignment.endTime}`
            : '';

        if (timeRange) {
            return `${this.shiftLabel} ${timeRange}`;
        }

        return this.shiftLabel;
    }

    get isVacation(): boolean {
        return this.assignmentList.some(item => item.shiftType === 'conges') || this.personnel?.status === 'conges';
    }

    get isRestDay(): boolean {
        if (this.assignment) {
            return false;
        }

        if (this.dayDate instanceof Date && !Number.isNaN(this.dayDate.getTime())) {
            const day = this.dayDate.getDay();
            return day === 0 || day === 6;
        }

        return false;
    }

    get cellTitle(): string {
        if (this.conflict?.description) {
            return this.conflict.details ? `${this.conflict.description} (${this.conflict.details})` : this.conflict.description;
        }
        if (this.assignmentList.length > 0) {
            return this.assignmentList
                .slice(0, 3)
                .map(item => this.getAssignmentLabel(item))
                .join(' | ');
        }
        if (this.isVacation) {
            return 'Jour de congé';
        }
        if (this.isRestDay) {
            return 'Jour de repos';
        }
        return 'Cellule vide';
    }

    onClickCell(): void {
        this.clicked.emit(this.dropData);
    }

    onContextMenu(event: MouseEvent): void {
        event.preventDefault();
        this.contextMenuAction.emit({ ...this.dropData, event });
    }

    onSelectionStart(): void {
        this.selectionStart.emit(this.dropData);
    }

    onSelectionEnter(): void {
        this.selectionEnter.emit(this.dropData);
    }

    onSelectionEnd(): void {
        this.selectionEnd.emit();
    }

    getShiftIcon(item: Assignment): string {
        const map: Record<string, string> = {
            jour:       'pi-sun',
            nuit:       'pi-moon',
            garde:      'pi-shield',
            astreinte:  'pi-bell',
            repos:      'pi-home',
            conges:     'pi-umbrella',
            formation:  'pi-book'
        };
        return map[item.shiftType] || 'pi-circle-fill';
    }

    getAssignmentLabel(item: Assignment): string {
        const explicitLabel = (item.posteLabel || '').trim();
        if (explicitLabel.length > 0) {
            return explicitLabel;
        }
        const map: Record<string, string> = {
            jour: 'Jour',
            nuit: 'Nuit',
            garde: 'Garde 24h',
            astreinte: 'Astreinte',
            repos: 'Repos',
            conges: 'Congés',
            formation: 'Formation'
        };
        return map[item.shiftType] || item.shiftType;
    }

    getTimeRange(item: Assignment): string {
        if (!item.startTime || !item.endTime) {
            return '';
        }
        return `${item.startTime} - ${item.endTime}`;
    }

    getCompactLabel(item: Assignment): string {
        const label = this.getAssignmentLabel(item);
        if (label.length === 0) {
            return this.getInitialShiftLetter(item.shiftType);
        }
        return label;
    }

    getInitialShiftLetter(shiftType: string): string {
        const map: Record<string, string> = {
            jour: 'J',
            nuit: 'N',
            garde: 'G',
            astreinte: 'A',
            repos: 'R',
            conges: 'C',
            formation: 'F'
        };
        return map[shiftType] || shiftType.charAt(0).toUpperCase();
    }

    getConflictDescription(): string {
        if (!this.conflict) {
            return '';
        }
        const description = this.conflict.description || 'Conflit détecté';
        return this.conflict.details ? `${description} - ${this.conflict.details}` : description;
    }

    private getAssignmentPeriodKey(item: Assignment): AssignmentPeriodGroup['key'] {
        const startHour = this.extractHour(item.startTime);
        if (item.shiftType === 'nuit') {
            return 'nuit';
        }
        if (startHour !== null && startHour < 12) {
            return 'matin';
        }
        if (startHour !== null && startHour < 20) {
            return 'apresMidi';
        }
        if (startHour !== null) {
            return 'nuit';
        }
        if (item.shiftType === 'jour') {
            return 'matin';
        }
        if (item.shiftType === 'garde' || item.shiftType === 'astreinte') {
            return 'apresMidi';
        }
        return 'autres';
    }

    private sortAssignmentsByPeriod(items: Assignment[]): Assignment[] {
        return [...items].sort((left, right) => {
            const leftRank = this.periodRank(this.getAssignmentPeriodKey(left));
            const rightRank = this.periodRank(this.getAssignmentPeriodKey(right));
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }
            const leftHour = this.extractHour(left.startTime) ?? 99;
            const rightHour = this.extractHour(right.startTime) ?? 99;
            return leftHour - rightHour;
        });
    }

    private periodRank(key: AssignmentPeriodGroup['key']): number {
        const ranks: Record<AssignmentPeriodGroup['key'], number> = {
            matin: 0,
            apresMidi: 1,
            nuit: 2,
            autres: 3
        };
        return ranks[key];
    }

    private extractHour(time?: string): number | null {
        if (!time) {
            return null;
        }
        const [hourStr] = time.split(':');
        const hour = Number(hourStr);
        return Number.isFinite(hour) ? hour : null;
    }
}
