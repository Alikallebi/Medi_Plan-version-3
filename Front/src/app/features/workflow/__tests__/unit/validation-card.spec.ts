import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { PlanningWorkflow } from '../../models';
import { ValidationCardComponent } from '../../components/validation-card/validation-card.component';

describe('ValidationCardComponent', () => {
    let component: ValidationCardComponent;
    let fixture: ComponentFixture<ValidationCardComponent>;
    let router: Router;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [ValidationCardComponent],
            imports: [RouterTestingModule],
            schemas: [NO_ERRORS_SCHEMA]
        }).compileComponents();

        fixture = TestBed.createComponent(ValidationCardComponent);
        component = fixture.componentInstance;
        router = TestBed.inject(Router);
    });

    afterEach(() => {
        jasmine.clock().uninstall();
    });

    it('should create', () => {
        component.planning = buildPlanningMock();
        fixture.detectChanges();
        expect(component).toBeTruthy();
    });

    it('should display planning info correctly', () => {
        component.planning = buildPlanningMock({
            serviceName: 'Urgences',
            weekStart: new Date('2026-03-03T00:00:00Z')
        });

        fixture.detectChanges();

        const title = (fixture.nativeElement as HTMLElement).querySelector('.card-header h3')?.textContent || '';
        const service = (fixture.nativeElement as HTMLElement).querySelector('.card-meta p strong')?.textContent || '';

        expect(title).toContain('Planning');
        expect(title).toContain('Urgences');
        expect(service).toContain('Urgences');
        expect(component.createdByLabel).toBe('Dr Test');
    });

    it('should show correct status badge', () => {
        component.planning = buildPlanningMock({
            workflowStatus: {
                status: 'REJETE',
                currentStepIndex: 1,
                changedAt: new Date().toISOString(),
                changedBy: 'validateur'
            }
        });

        fixture.detectChanges();

        const badge = (fixture.nativeElement as HTMLElement).querySelector('.status-badge') as HTMLElement;
        expect(badge.textContent).toContain('REJETE');
        expect(badge.classList.contains('rejete')).toBeTrue();
    });

    it('should calculate days in waiting correctly', () => {
        jasmine.clock().install();
        const now = new Date('2026-02-25T12:00:00Z');
        jasmine.clock().mockDate(now);

        component.planning = buildPlanningMock({
            history: [
                {
                    id: 'h1',
                    at: new Date('2026-02-23T12:00:00Z'),
                    author: 'Dr Test',
                    action: 'SOUMISSION',
                    details: 'Soumis'
                }
            ]
        });

        fixture.detectChanges();

        expect(component.waitingDays).toBe(2);
        expect(component.remainingHours).toBe(24);
    });

    it('should emit event when "Voir détails" clicked', () => {
        component.planning = buildPlanningMock({ id: '123' });
        fixture.detectChanges();

        const emitSpy = spyOn(component.voirDetails, 'emit');
        const navigateSpy = spyOn(router, 'navigate');

        const detailsButton = (fixture.nativeElement as HTMLElement).querySelector('.btn-details') as HTMLButtonElement;
        detailsButton.click();

        expect(emitSpy).toHaveBeenCalledWith(123);
        expect(navigateSpy).toHaveBeenCalledWith(['/workflow/validation', 123]);
    });

    it('should open modal when "Valider" clicked', () => {
        component.planning = buildPlanningMock();
        fixture.detectChanges();

        const validateButton = (fixture.nativeElement as HTMLElement).querySelector('.btn-approve') as HTMLButtonElement;
        validateButton.click();

        expect(component.showApprobationModal).toBeTrue();
    });

    it('should show urgent style when delay exceeded', () => {
        jasmine.clock().install();
        jasmine.clock().mockDate(new Date('2026-02-25T12:00:00Z'));

        component.planning = buildPlanningMock({
            history: [
                {
                    id: 'h1',
                    at: new Date('2026-02-20T12:00:00Z'),
                    author: 'Dr Test',
                    action: 'SOUMISSION',
                    details: 'Soumis'
                }
            ]
        });

        fixture.detectChanges();

        expect(component.remainingHours).toBe(0);
        expect(component.urgencyClass).toBe('card-overdue');

        const card = (fixture.nativeElement as HTMLElement).querySelector('.validation-card') as HTMLElement;
        expect(card.classList.contains('card-overdue')).toBeTrue();
    });

    it('should display special style context for Super Admin final validation', () => {
        component.planning = buildPlanningMock({
            workflowStatus: {
                status: 'EN_ATTENTE_N2',
                currentStepIndex: 3,
                changedAt: new Date().toISOString(),
                changedBy: 'rh'
            }
        });

        fixture.detectChanges();

        const currentStep = (fixture.nativeElement as HTMLElement).querySelector('.step.current') as HTMLElement;
        expect(currentStep).toBeTruthy();
        expect(currentStep.textContent).toContain('Super Admin');
    });
});

function buildPlanningMock(overrides: Partial<PlanningWorkflow> = {}): PlanningWorkflow {
    return {
        id: '1',
        serviceId: '10',
        serviceName: 'Cardiologie',
        weekStart: new Date('2026-02-03T00:00:00Z'),
        weekEnd: new Date('2026-02-09T00:00:00Z'),
        assignments: [],
        personnel: [],
        rules: [],
        conflicts: [],
        history: [
            {
                id: 'h1',
                at: new Date('2026-02-24T12:00:00Z'),
                author: 'Dr Test',
                action: 'SOUMISSION',
                details: 'Soumis'
            }
        ],
        workflowConfigId: 'wf-1',
        workflowStatus: {
            status: 'EN_ATTENTE_N1',
            currentStepIndex: 0,
            changedAt: new Date().toISOString(),
            changedBy: 'Dr Test'
        },
        validationHistory: [],
        currentVersionId: 'v1',
        lockVersion: 1,
        ...overrides
    };
}
