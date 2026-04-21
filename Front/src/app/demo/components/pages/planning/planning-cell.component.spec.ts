import { PlanningCellComponent } from './planning-cell.component';
import { Assignment, Personnel, PlanningEvent } from 'src/app/demo/api/planning.models';

describe('PlanningCellComponent', () => {
    let component: PlanningCellComponent;

    const basePersonnel: Personnel = {
        id: 'staff-1',
        nom: 'Martin',
        prenom: 'Tom',
        role: 'Médecin',
        specialty: 'Urgences',
        category: 'medecin',
        status: 'disponible'
    };

    beforeEach(() => {
        component = new PlanningCellComponent();
        component.personnel = basePersonnel;
        component.dayIndex = 2;
        component.dayDate = new Date('2026-02-18T00:00:00.000Z');
    });

    it('keeps ARRET as the full-width priority event', () => {
        const events: PlanningEvent[] = [
            { type: 'HS', startDate: '2026-02-18', endDate: '2026-02-18', startTime: '17:00', endTime: '19:00', status: 'approved' },
            { type: 'VA', startDate: '2026-02-18', endDate: '2026-02-18', status: 'approved' },
            { type: 'ARRET', startDate: '2026-02-18', endDate: '2026-02-18', reason: 'Arrêt prescrit', status: 'info_only' }
        ];

        const resolved = component.resolveSlotDisplay(events);

        expect(resolved).toHaveSize(1);
        expect(resolved[0].type).toBe('ARRET');
    });

    it('renders appended HS after the planned shift end', () => {
        const shift: Assignment = {
            id: 'shift-1',
            personnelId: 'staff-1',
            day: 2,
            shiftType: 'jour',
            startTime: '08:00',
            endTime: '17:00'
        };
        const hsEvent: PlanningEvent = {
            id: 'hs-1',
            type: 'HS',
            startDate: '2026-02-18',
            endDate: '2026-02-18',
            startTime: '17:00',
            endTime: '19:30',
            status: 'approved'
        };
        component.assignmentList;
        component.assignments = [{ ...shift, events: [hsEvent] }];

        const display = component.slotDisplay;

        expect(display.fullWidthEvent).toBeNull();
        expect(display.timelineBlocks.some(block => block.type === 'SHIFT')).toBeTrue();
        expect(display.timelineBlocks.some(block => block.type === 'HS')).toBeTrue();
        expect(display.hsMinutes).toBe(150);
    });

    it('shows an AS intervention overlay when HS is linked', () => {
        const asEvent: PlanningEvent = {
            id: 'as-1',
            type: 'AS',
            startDate: '2026-02-18',
            endDate: '2026-02-18',
            startTime: '18:00',
            endTime: '22:00',
            status: 'approved',
            linkedHsId: 'hs-link'
        };
        const linkedHs: PlanningEvent = {
            id: 'hs-link',
            type: 'HS',
            startDate: '2026-02-18',
            endDate: '2026-02-18',
            startTime: '19:00',
            endTime: '21:00',
            status: 'approved'
        };
        component.assignments = [{
            id: 'assignment-1',
            personnelId: 'staff-1',
            day: 2,
            shiftType: 'jour',
            startTime: '08:00',
            endTime: '17:00',
            events: [asEvent, linkedHs]
        }];

        const display = component.slotDisplay;

        expect(display.timelineBlocks.some(block => block.type === 'AS' && block.interventionActive)).toBeTrue();
        expect(display.timelineBlocks.some(block => block.type === 'AS_INTERVENTION' && block.isOverlay)).toBeTrue();
    });
});
