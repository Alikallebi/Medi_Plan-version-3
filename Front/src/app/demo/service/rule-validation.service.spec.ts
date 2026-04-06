import { RuleValidationService } from './rule-validation.service';
import { PlanningData } from '../api/planning.models';

describe('RuleValidationService', () => {
    let service: RuleValidationService;

    const basePlanning = (): PlanningData => ({
        id: 'plan-1',
        serviceId: 'cardio',
        serviceName: 'Cardiologie',
        weekStart: new Date('2026-02-16'),
        weekEnd: new Date('2026-02-22'),
        assignments: [],
        personnel: [],
        rules: [],
        conflicts: [],
        history: []
    });

    beforeEach(() => {
        service = new RuleValidationService();
    });

    it('rejects a double assignment on same day', () => {
        const planning = basePlanning();
        planning.assignments.push({ id: 'a1', personnelId: 'p1', day: 0, shiftType: 'jour' });

        const result = service.validateAssignment({ id: 'a2', personnelId: 'p1', day: 0, shiftType: 'nuit' }, planning);

        expect(result.valid).toBeFalse();
        expect(result.violations[0]).toContain('déjà affecté');
    });

    it('rejects guard assignment when weekly quota is already reached', () => {
        const planning = basePlanning();
        planning.assignments.push(
            { id: 'a1', personnelId: 'p1', day: 0, shiftType: 'garde' },
            { id: 'a2', personnelId: 'p1', day: 1, shiftType: 'garde' },
            { id: 'a3', personnelId: 'p1', day: 2, shiftType: 'garde' }
        );

        const result = service.validateAssignment({ id: 'a4', personnelId: 'p1', day: 4, shiftType: 'garde' }, planning);

        expect(result.valid).toBeFalse();
        expect(result.violations.join(' ')).toContain('Quota maximum');
    });
});
