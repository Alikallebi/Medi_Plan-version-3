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

    getEmployeeHsLabel(personnelId: string): string {
        const totalMinutes = this.getEmployeeHsMinutes(personnelId);
        if (!totalMinutes) {
            return '';
        }

        return this.formatMinutesLabel(totalMinutes);
    }

    hasEmployeeHs(personnelId: string): boolean {
        return this.getEmployeeHsMinutes(personnelId) > 0;
    }

    private getEmployeeHsMinutes(personnelId: string): number {
        const personAssignments = this.assignments.filter(item => item.personnelId === personnelId);
        let totalMinutes = 0;
        const assignmentsByDay = new Map<number, Assignment[]>();

        for (const assignment of personAssignments) {
            const bucket = assignmentsByDay.get(assignment.day) ?? [];
            bucket.push(assignment);
            assignmentsByDay.set(assignment.day, bucket);
        }

        for (const dayAssignments of assignmentsByDay.values()) {
            if (dayAssignments.some(item => this.isArretAssignment(item))) {
                continue;
            }

            for (const assignment of dayAssignments) {
                if (Array.isArray(assignment.events)) {
                    for (const evt of assignment.events) {
                        if (evt?.type === 'HS' && evt.startTime && evt.endTime) {
                            totalMinutes += this.diffMinutes(evt.startTime, evt.endTime);
                        }
                    }
                }

                const directType = (assignment.eventType || assignment.type || '').toUpperCase();
                if (directType === 'HS' && assignment.startTime && assignment.endTime) {
                    totalMinutes += this.diffMinutes(assignment.startTime, assignment.endTime);
                }
            }
        }

        return totalMinutes;
    }

    private isArretAssignment(assignment: Assignment): boolean {
        const directType = (assignment.eventType || assignment.type || '').toUpperCase();
        if (directType === 'ARRET') {
            return true;
        }

        return Array.isArray(assignment.events)
            ? assignment.events.some(evt => evt?.type === 'ARRET')
            : false;
    }

    private formatMinutesLabel(totalMinutes: number): string {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours}h${minutes.toString().padStart(2, '0')}`;
    }

    private diffMinutes(startTime: string, endTime: string): number {
        const start = this.toMinutes(startTime);
        const endRaw = this.toMinutes(endTime);
        const end = endRaw >= start ? endRaw : endRaw + 24 * 60;
        return Math.max(end - start, 0);
    }

    private toMinutes(time: string): number {
        const [h, m] = (time || '').split(':').map(value => Number(value));
        if (!Number.isFinite(h) || !Number.isFinite(m)) {
            return 0;
        }
        return h * 60 + m;
    }
}
