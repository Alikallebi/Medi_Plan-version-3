import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Assignment, Conflict, DragPlanningItem, DropTargetCell, Personnel } from 'src/app/demo/api/planning.models';

@Component({
    selector: 'app-weekly-planning',
    templateUrl: './weekly-planning.component.html',
    styleUrls: ['./weekly-planning.component.scss']
})
export class WeeklyPlanningComponent {
    @Input() personnel: Personnel[] = [];
    @Input() assignments: Assignment[] = [];
    @Input() weekDays: string[] = [];
    @Input() dayDates: Date[] = [];
    @Input() conflicts: Conflict[] = [];
    @Input() dropValidator: ((drag: DragPlanningItem, target: DropTargetCell) => boolean) | null = null;
    @Input() selectedCellKeys = new Set<string>();

    @Output() cellDropped = new EventEmitter<{ dragData: DragPlanningItem; targetData: DropTargetCell }>();
    @Output() cellClicked = new EventEmitter<{ personnelId: string; day: number }>();
    @Output() cellContextMenu = new EventEmitter<{ personnelId: string; day: number; event: MouseEvent }>();
    @Output() selectionStart = new EventEmitter<{ personnelId: string; day: number }>();
    @Output() selectionEnter = new EventEmitter<{ personnelId: string; day: number }>();
    @Output() selectionEnd = new EventEmitter<void>();

    get dayIndexes(): number[] {
        return this.weekDays.map((_, index) => index);
    }

    readonly shiftLegend = [
        { key: 'jour', label: 'Matin / Jour', icon: '🌞' },
        { key: 'nuit', label: 'Nuit', icon: '🌙' },
        { key: 'garde', label: 'Garde', icon: '⚕️' },
        { key: 'astreinte', label: 'Astreinte', icon: '📞' },
        { key: 'repos', label: 'Repos / Congés', icon: '🛌' }
    ];

    getAssignment(personnelId: string, day: number): Assignment | null {
        return this.assignments.find(item => item.personnelId === personnelId && item.day === day) || null;
    }

    getAssignmentsForCell(personnelId: string, day: number): Assignment[] {
        return this.assignments.filter(item => item.personnelId === personnelId && item.day === day);
    }

    personHasAnyAssignment(personnelId: string): boolean {
        return this.assignments.some(a => a.personnelId === personnelId);
    }

    getPersonAssignmentCount(personnelId: string): number {
        return this.assignments.filter(a => a.personnelId === personnelId).length;
    }

    hasConflict(personnelId: string, day: number): boolean {
        return this.conflicts.some(conflict => conflict.personnelId === personnelId && conflict.day === day);
    }

    getConflict(personnelId: string, day: number): Conflict | null {
        return this.conflicts.find(conflict => conflict.personnelId === personnelId && conflict.day === day) || null;
    }

    getCellKey(personnelId: string, day: number): string {
        return `${personnelId}-${day}`;
    }

    isToday(date: Date): boolean {
        if (!date) return false;
        const today = new Date();
        const d = new Date(date);
        return d.getFullYear() === today.getFullYear() &&
               d.getMonth() === today.getMonth() &&
               d.getDate() === today.getDate();
    }

    getRoleClass(role: string): string {
        if (!role) return 'role-default';
        const r = role.toLowerCase();
        if (r.includes('admin')) return 'role-admin';
        if (r.includes('chef')) return 'role-chef';
        if (r.includes('validateur') || r.includes('rh')) return 'role-validateur';
        if (r === 'staff') return 'role-staff';
        return 'role-default';
    }

    getRoleBadgeClass(role: string): string {
        if (!role) return 'badge-default';
        const r = role.toLowerCase();
        if (r.includes('admin')) return 'badge-admin';
        if (r.includes('chef')) return 'badge-chef';
        if (r.includes('validateur') || r.includes('rh')) return 'badge-validateur';
        if (r === 'staff') return 'badge-staff';
        return 'badge-default';
    }
}
