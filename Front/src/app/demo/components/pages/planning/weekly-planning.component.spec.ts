import { WeeklyPlanningComponent } from './weekly-planning.component';
import { Assignment, Personnel } from 'src/app/demo/api/planning.models';

describe('WeeklyPlanningComponent', () => {
    let component: WeeklyPlanningComponent;

    const person: Personnel = {
        id: 'staff-1',
        nom: 'Martin',
        prenom: 'Tom',
        role: 'Médecin',
        specialty: 'Urgences',
        category: 'medecin',
        status: 'disponible'
    };

    beforeEach(() => {
        component = new WeeklyPlanningComponent();
        component.personnel = [person];
        component.weekDays = ['Lundi', 'Mardi', 'Mercredi'];
        component.dayDates = [
            new Date('2026-02-16T00:00:00.000Z'),
            new Date('2026-02-17T00:00:00.000Z'),
            new Date('2026-02-18T00:00:00.000Z')
        ];
    });

    it('formats the HS badge as a compact duration label', () => {
        component.assignments = [
            {
                id: 'hs-1',
                personnelId: 'staff-1',
                day: 0,
                shiftType: 'jour',
                eventType: 'HS',
                startTime: '17:00',
                endTime: '20:30'
            }
        ];

        expect(component.getEmployeeHsLabel('staff-1')).toBe('3h30');
    });

    it('supports overnight HS durations', () => {
        component.assignments = [
            {
                id: 'hs-2',
                personnelId: 'staff-1',
                day: 1,
                shiftType: 'jour',
                eventType: 'HS',
                startTime: '22:00',
                endTime: '02:00'
            }
        ];

        expect(component.getEmployeeHsLabel('staff-1')).toBe('4h00');
    });

    it('sums multiple HS assignments on the same employee', () => {
        component.assignments = [
            {
                id: 'hs-1',
                personnelId: 'staff-1',
                day: 0,
                shiftType: 'jour',
                eventType: 'HS',
                startTime: '17:00',
                endTime: '18:30'
            },
            {
                id: 'hs-2',
                personnelId: 'staff-1',
                day: 2,
                shiftType: 'jour',
                eventType: 'HS',
                startTime: '19:00',
                endTime: '20:30'
            }
        ];

        expect(component.getEmployeeHsLabel('staff-1')).toBe('3h00');
    });

    it('excludes HS totals when the day is blocked by ARRET', () => {
        component.assignments = [
            {
                id: 'arret-1',
                personnelId: 'staff-1',
                day: 1,
                shiftType: 'repos',
                eventType: 'ARRET',
                startDate: '2026-02-17',
                endDate: '2026-02-17',
                events: [{ type: 'ARRET', startDate: '2026-02-17', endDate: '2026-02-17', status: 'info_only' }]
            },
            {
                id: 'hs-3',
                personnelId: 'staff-1',
                day: 1,
                shiftType: 'jour',
                eventType: 'HS',
                startTime: '17:00',
                endTime: '20:30'
            }
        ] as Assignment[];

        expect(component.hasEmployeeHs('staff-1')).toBeFalse();
        expect(component.getEmployeeHsLabel('staff-1')).toBe('');
    });
});
