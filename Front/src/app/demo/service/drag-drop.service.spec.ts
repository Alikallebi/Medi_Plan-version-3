import { DragDropService } from './drag-drop.service';
import { RuleValidationService } from './rule-validation.service';
import { PlanningData } from '../api/planning.models';

describe('DragDropService', () => {
    let service: DragDropService;

    beforeEach(() => {
        service = new DragDropService(new RuleValidationService());
    });

    it('stores current dragging item', () => {
        service.startDrag({ source: 'list', personnelId: 'p1', shiftType: 'jour' });
        expect(service.currentDragItem?.personnelId).toBe('p1');
    });

    it('validates drop against planning rules', () => {
        const planning: PlanningData = {
            id: 'plan-1',
            serviceId: 'cardio',
            serviceName: 'Cardiologie',
            weekStart: new Date('2026-02-16'),
            weekEnd: new Date('2026-02-22'),
            assignments: [{ id: 'a1', personnelId: 'p1', day: 0, shiftType: 'jour' }],
            personnel: [],
            rules: [],
            conflicts: [],
            history: []
        };

        const result = service.validateDrop(
            { source: 'list', personnelId: 'p1', shiftType: 'nuit' },
            { personnelId: 'p1', day: 0 },
            planning
        );

        expect(result.valid).toBeFalse();
    });
});
