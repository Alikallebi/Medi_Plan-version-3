import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Assignment, Conflict, DragPlanningItem, DropTargetCell, Personnel, PlanningEvent, PlanningEventType, PlanningNotification } from 'src/app/demo/api/planning.models';

const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 22;
const TIMELINE_TOTAL_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;

export const PRIORITY: PlanningEventType[] = ['ARRET', 'ABSENCE', 'VA', 'AL', 'JR', 'AS', 'HS'];

interface TimeRange {
    startTime: string;
    endTime: string;
}

interface TimelineBlock {
    type: 'SHIFT' | PlanningEventType | 'AS_INTERVENTION';
    label: string;
    leftPct: number;
    widthPct: number;
    title: string;
    reason?: string;
    atBadge?: boolean;
    warning?: boolean;
    interventionActive?: boolean;
    isOverlay?: boolean;
}

interface ResolvedSlotDisplay {
    fullWidthEvent: PlanningEvent | null;
    timelineBlocks: TimelineBlock[];
    hsMinutes: number;
    arretNotification: PlanningNotification | null;
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
            return this.assignments;
        }
        return this.assignment ? [this.assignment] : [];
    }

    get hasAssignments(): boolean {
        return this.assignmentList.length > 0;
    }

    get slotDisplay(): ResolvedSlotDisplay {
        const events = this.getNormalizedEvents();
        const resolvedEvents = this.resolveSlotDisplay(events);
        const fullWidthEvent = resolvedEvents.find(evt => this.isFullWidthType(evt.type)) || null;

        if (fullWidthEvent) {
            return {
                fullWidthEvent,
                timelineBlocks: [],
                hsMinutes: 0,
                arretNotification: fullWidthEvent.type === 'ARRET' ? this.buildArretNotification(fullWidthEvent) : null
            };
        }

        const baseShift = this.getPlannedShiftRange();
        const timelineBlocks: TimelineBlock[] = [];
        let hsMinutes = 0;

        if (baseShift) {
            timelineBlocks.push(this.createTimelineBlockFromRange('SHIFT', 'Planned shift', baseShift.startTime, baseShift.endTime, 'Planned shift'));
        }

        const asEvents = resolvedEvents.filter(evt => evt.type === 'AS');
        const hsEvents = resolvedEvents.filter(evt => evt.type === 'HS');

        for (const asEvent of asEvents) {
            if (!asEvent.startTime || !asEvent.endTime) {
                continue;
            }

            const linkedIntervention = this.findLinkedHsForAs(asEvent, hsEvents);

            timelineBlocks.push(
                this.createTimelineBlockFromRange(
                    'AS',
                    'AS',
                    asEvent.startTime,
                    asEvent.endTime,
                    linkedIntervention
                        ? 'Astreinte (intervention active)'
                        : 'Astreinte',
                    {
                        interventionActive: Boolean(linkedIntervention)
                    }
                )
            );

            if (linkedIntervention?.startTime && linkedIntervention?.endTime) {
                timelineBlocks.push(
                    this.createTimelineBlockFromRange(
                        'AS_INTERVENTION',
                        'Intervention HS',
                        linkedIntervention.startTime,
                        linkedIntervention.endTime,
                        'Intervention active pendant astreinte',
                        { isOverlay: true }
                    )
                );
            }
        }

        const nonLinkedHs = hsEvents.filter(evt => !evt.linkedHsId);
        const referenceShiftEnd = baseShift?.endTime;
        for (const hsEvent of nonLinkedHs) {
            const resolvedHs = this.getAppendedHsRange(hsEvent, referenceShiftEnd);
            if (!resolvedHs) {
                continue;
            }

            const minutes = this.durationMinutes(resolvedHs.startTime, resolvedHs.endTime);
            hsMinutes += minutes;

            const tooltip = `Start: ${resolvedHs.startTime}, End: ${resolvedHs.endTime}, Duration: ${this.formatDuration(minutes)}`;
            timelineBlocks.push(
                this.createTimelineBlockFromRange('HS', 'HS', resolvedHs.startTime, resolvedHs.endTime, tooltip)
            );
        }

        return {
            fullWidthEvent: null,
            timelineBlocks,
            hsMinutes,
            arretNotification: null
        };
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

    get fullWidthEvent(): PlanningEvent | null {
        return this.slotDisplay.fullWidthEvent;
    }

    get timelineBlocks(): TimelineBlock[] {
        return this.slotDisplay.timelineBlocks;
    }

    get hasTimelineBlocks(): boolean {
        return this.timelineBlocks.length > 0;
    }

    get hsMinutes(): number {
        return this.slotDisplay.hsMinutes;
    }

    get hsBadgeLabel(): string {
        if (!this.hsMinutes) {
            return '';
        }
        return `HS ${this.formatDuration(this.hsMinutes)}`;
    }

    get fullWidthLabel(): string {
        if (!this.fullWidthEvent) {
            return '';
        }

        const labels: Record<PlanningEventType, string> = {
            ARRET: 'Arret de travail',
            ABSENCE: 'Absence',
            VA: 'VA - Conge annuel',
            AL: 'AL - Conge legal',
            JR: 'JR - Jour de repos',
            AS: 'Astreinte',
            HS: 'Heures supplementaires'
        };

        return labels[this.fullWidthEvent.type] || this.fullWidthEvent.type;
    }

    get fullWidthTitle(): string {
        if (!this.fullWidthEvent) {
            return '';
        }

        if (this.fullWidthEvent.type === 'ARRET' && this.slotDisplay.arretNotification) {
            return this.slotDisplay.arretNotification.message;
        }

        if (this.fullWidthEvent.reason) {
            return `${this.fullWidthLabel} - ${this.fullWidthEvent.reason}`;
        }

        return this.fullWidthLabel;
    }

    get showAtBadge(): boolean {
        return Boolean(this.fullWidthEvent && this.isWorkAccidentReason(this.fullWidthEvent.reason));
    }

    get showUnjustifiedWarning(): boolean {
        return Boolean(this.fullWidthEvent && this.fullWidthEvent.type === 'ABSENCE' && this.isUnjustifiedReason(this.fullWidthEvent.reason));
    }

    get isVacation(): boolean {
        return Boolean(this.fullWidthEvent && (this.fullWidthEvent.type === 'VA' || this.fullWidthEvent.type === 'AL'))
            || this.assignmentList.some(item => item.shiftType === 'conges')
            || this.personnel?.status === 'conges';
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
        if (this.fullWidthEvent) {
            return this.fullWidthTitle;
        }
        if (this.timelineBlocks.length > 0) {
            return this.timelineBlocks.map(block => block.title).join(' | ');
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

    resolveSlotDisplay(events: PlanningEvent[]): PlanningEvent[] {
        const normalized = [...events].sort((left, right) => {
            const leftRank = PRIORITY.indexOf(left.type);
            const rightRank = PRIORITY.indexOf(right.type);
            if (leftRank !== rightRank) {
                return leftRank - rightRank;
            }
            return (left.startTime || '').localeCompare(right.startTime || '');
        });

        const fullWidthEvent = normalized.find(event => this.isFullWidthType(event.type));
        if (fullWidthEvent) {
            return [fullWidthEvent];
        }

        return normalized.filter(event => event.type === 'AS' || event.type === 'HS');
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

    private getNormalizedEvents(): PlanningEvent[] {
        const events: PlanningEvent[] = [];

        for (const item of this.assignmentList) {
            if (Array.isArray(item.events)) {
                for (const nestedEvent of item.events) {
                    const event = this.normalizeEvent(nestedEvent);
                    if (event) {
                        events.push(event);
                    }
                }
            }

            const inferred = this.extractEventFromAssignment(item);
            if (inferred) {
                events.push(inferred);
            }
        }

        return events;
    }

    private normalizeEvent(event: PlanningEvent | null | undefined): PlanningEvent | null {
        if (!event?.type) {
            return null;
        }

        return {
            ...event,
            status: event.status || (event.type === 'ARRET' ? 'info_only' : 'approved'),
            startDate: event.startDate || this.toIsoDate(this.dayDate),
            endDate: event.endDate || this.toIsoDate(this.dayDate)
        };
    }

    private extractEventFromAssignment(item: Assignment): PlanningEvent | null {
        const explicitType = (item.eventType || item.type || '').toUpperCase() as PlanningEventType;
        const inferredType = this.inferEventType(item, explicitType);
        if (!inferredType) {
            return null;
        }

        return {
            id: item.id,
            type: inferredType,
            startDate: item.startDate || this.toIsoDate(this.dayDate),
            endDate: item.endDate || this.toIsoDate(this.dayDate),
            startTime: item.startTime,
            endTime: item.endTime,
            reason: item.reason || item.note,
            linkedHsId: item.linkedHsId,
            status: item.status || (inferredType === 'ARRET' ? 'info_only' : 'approved')
        };
    }

    private inferEventType(item: Assignment, explicitType: PlanningEventType | ''): PlanningEventType | null {
        if (explicitType && PRIORITY.includes(explicitType)) {
            return explicitType;
        }

        const text = `${item.shiftType} ${item.posteLabel || ''} ${item.note || ''}`.toLowerCase();

        if (item.shiftType === 'astreinte') {
            return 'AS';
        }
        if (item.shiftType === 'repos') {
            return 'JR';
        }
        if (item.shiftType === 'conges') {
            return text.includes('legal') ? 'AL' : 'VA';
        }
        if (text.includes('arret')) {
            return 'ARRET';
        }
        if (text.includes('absence')) {
            return 'ABSENCE';
        }
        if (text.includes(' hs') || text.startsWith('hs') || text.includes('overtime') || text.includes('heure supp')) {
            return 'HS';
        }

        return null;
    }

    private getPlannedShiftRange(): TimeRange | null {
        const shift = this.assignmentList.find(item => {
            if (!item.startTime || !item.endTime) {
                return false;
            }
            if (item.shiftType === 'repos' || item.shiftType === 'conges' || item.shiftType === 'astreinte') {
                return false;
            }
            if (item.eventType || item.type) {
                return false;
            }
            return true;
        });

        if (!shift?.startTime || !shift?.endTime) {
            return null;
        }

        return { startTime: shift.startTime, endTime: shift.endTime };
    }

    private findLinkedHsForAs(asEvent: PlanningEvent, hsEvents: PlanningEvent[]): PlanningEvent | null {
        if (!asEvent.linkedHsId) {
            return null;
        }
        return hsEvents.find(item => item.id === asEvent.linkedHsId) || null;
    }

    private getAppendedHsRange(hsEvent: PlanningEvent, shiftEndTime?: string): TimeRange | null {
        if (!hsEvent.endTime && !shiftEndTime) {
            return null;
        }

        if (!shiftEndTime) {
            if (!hsEvent.startTime || !hsEvent.endTime) {
                return null;
            }
            return { startTime: hsEvent.startTime, endTime: hsEvent.endTime };
        }

        const hsEnd = hsEvent.endTime || shiftEndTime;
        return {
            startTime: shiftEndTime,
            endTime: hsEnd
        };
    }

    private createTimelineBlockFromRange(
        type: TimelineBlock['type'],
        label: string,
        startTime: string,
        endTime: string,
        title: string,
        options?: Partial<TimelineBlock>
    ): TimelineBlock {
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);
        const spanStart = Math.max(startMinutes, TIMELINE_START_HOUR * 60);
        const spanEnd = Math.min(this.normalizeEndMinutes(startMinutes, endMinutes), TIMELINE_END_HOUR * 60);
        const clampedDuration = Math.max(spanEnd - spanStart, 1);

        return {
            type,
            label,
            leftPct: ((spanStart - TIMELINE_START_HOUR * 60) / TIMELINE_TOTAL_MINUTES) * 100,
            widthPct: (clampedDuration / TIMELINE_TOTAL_MINUTES) * 100,
            title,
            reason: options?.reason,
            atBadge: options?.atBadge,
            warning: options?.warning,
            interventionActive: options?.interventionActive,
            isOverlay: options?.isOverlay
        };
    }

    private buildArretNotification(event: PlanningEvent): PlanningNotification {
        const employeeName = `${this.personnel?.prenom || ''} ${this.personnel?.nom || ''}`.trim() || this.personnel?.id || 'Unknown';
        return {
            type: 'info',
            recipientId: 'planning_creator',
            employeeId: this.personnel?.id || '',
            eventType: 'ARRET',
            message: `Employee ${employeeName} is on medical leave from ${event.startDate} to ${event.endDate}. Please update the schedule.`,
            startDate: event.startDate,
            endDate: event.endDate,
            requiresAction: false
        };
    }

    private isFullWidthType(type: PlanningEventType): boolean {
        return type === 'ARRET' || type === 'ABSENCE' || type === 'VA' || type === 'AL' || type === 'JR';
    }

    private isWorkAccidentReason(reason?: string): boolean {
        return String(reason || '').toLowerCase().includes('work_accident')
            || String(reason || '').toLowerCase().includes('accident_travail')
            || String(reason || '').toLowerCase().includes('at');
    }

    private isUnjustifiedReason(reason?: string): boolean {
        return String(reason || '').toLowerCase().includes('unjustified');
    }

    private toIsoDate(input: Date): string {
        if (!(input instanceof Date) || Number.isNaN(input.getTime())) {
            return new Date().toISOString().slice(0, 10);
        }
        return input.toISOString().slice(0, 10);
    }

    private durationMinutes(startTime: string, endTime: string): number {
        const start = this.timeToMinutes(startTime);
        const end = this.normalizeEndMinutes(start, this.timeToMinutes(endTime));
        return Math.max(end - start, 0);
    }

    private formatDuration(totalMinutes: number): string {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours} h ${minutes} min`;
    }

    private timeToMinutes(time?: string): number {
        if (!time) {
            return TIMELINE_START_HOUR * 60;
        }
        const [h, m] = time.split(':').map(value => Number(value));
        if (!Number.isFinite(h) || !Number.isFinite(m)) {
            return TIMELINE_START_HOUR * 60;
        }
        return h * 60 + m;
    }

    private normalizeEndMinutes(start: number, end: number): number {
        if (end >= start) {
            return end;
        }
        return end + 24 * 60;
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
