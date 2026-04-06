import { ConflictDetectionService } from './conflict-detection.service';
import { PlanningData } from '../api/planning.models';

describe('ConflictDetectionService', () => {
    let service: ConflictDetectionService;

    beforeEach(() => {
        service = new ConflictDetectionService();
    });

    it('detects double assignment conflict', () => {
        const planning: PlanningData = {
            id: 'p-1',
            serviceId: 'urg',
            serviceName: 'Urgences',
            weekStart: new Date('2026-02-16'),
            weekEnd: new Date('2026-02-22'),
            personnel: [{ id: 'u1', nom: 'Martin', prenom: 'Tom', role: 'Médecin', specialty: 'Urgences', category: 'medecin', status: 'disponible' }],
            assignments: [
                { id: 'a1', personnelId: 'u1', day: 2, shiftType: 'jour' },
                { id: 'a2', personnelId: 'u1', day: 2, shiftType: 'nuit' }
            ],
            rules: [],
            conflicts: [],
            history: []
        };

        const conflicts = service.detectConflicts(planning);
        expect(conflicts.some(item => item.type === 'double_affectation')).toBeTrue();
    });

    it('detects guard quota conflicts', () => {
        const planning: PlanningData = {
            id: 'p-2',
            serviceId: 'urg',
            serviceName: 'Urgences',
            weekStart: new Date('2026-02-16'),
            weekEnd: new Date('2026-02-22'),
            personnel: [{ id: 'u1', nom: 'Martin', prenom: 'Tom', role: 'Médecin', specialty: 'Urgences', category: 'medecin', status: 'disponible' }],
            assignments: [
                { id: 'a1', personnelId: 'u1', day: 0, shiftType: 'garde' },
                { id: 'a2', personnelId: 'u1', day: 1, shiftType: 'garde' },
                { id: 'a3', personnelId: 'u1', day: 2, shiftType: 'garde' },
                { id: 'a4', personnelId: 'u1', day: 3, shiftType: 'garde' }
            ],
            rules: [],
            conflicts: [],
            history: []
        };

        const conflicts = service.detectConflicts(planning);
        expect(conflicts.some(item => item.type === 'quota_depasse')).toBeTrue();
    });
});
