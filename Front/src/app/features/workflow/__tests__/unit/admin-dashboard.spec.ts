import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { AdminDashboardComponent } from '../../components/admin-dashboard/admin-dashboard.component';
import { BlockedPlanning, DashboardStats, ValidatorPerformance } from '../../models';
import { NotificationService } from '../../services/notification.service';
import { WorkflowService } from '../../services/workflow.service';
import { AuthService } from '../../../../demo/service/auth.service';
import { UserContext } from '../../models/user-context.model';

describe('AdminDashboardComponent', () => {
    let component: AdminDashboardComponent;
    let workflowServiceMock: jasmine.SpyObj<WorkflowService>;
    let notificationMock: jasmine.SpyObj<NotificationService>;
    let authServiceMock: jasmine.SpyObj<AuthService>;
    let routerMock: jasmine.SpyObj<Router>;

    beforeEach(() => {
        workflowServiceMock = jasmine.createSpyObj<WorkflowService>('WorkflowService', [
            'getAdminDashboardData',
            'relancerValidateur',
            'reaffecterValidation',
            'validerDoffice'
        ]);
        notificationMock = jasmine.createSpyObj<NotificationService>('NotificationService', ['info', 'error', 'success']);

        workflowServiceMock.getAdminDashboardData.and.returnValue(of({
            stats: buildStats(),
            blocked: buildBlocked(),
            performance: buildPerformance()
        }));

        const mockUserContext: UserContext = {
            id: 1,
            nom: 'Admin',
            prenom: 'Super',
            nomComplet: 'Super Admin',
            email: 'admin@example.com',
            role: 'ADMIN',
            roleNormalized: 'admin-gta',
            permissions: {
                canValidate: true,
                canConfigure: true,
                canViewAdmin: true,
                canViewAudit: true,
                canValidateFinal: true,
                canCreatePlanning: true,
                canComment: true,
                canAttachFiles: true
            },
            estActif: true
        };

        authServiceMock = jasmine.createSpyObj<AuthService>('AuthService', ['getUserContext'], {
            userContext$: of(mockUserContext)
        });
        routerMock = jasmine.createSpyObj<Router>('Router', ['navigate']);

        component = new AdminDashboardComponent(workflowServiceMock, notificationMock, authServiceMock, routerMock);
    });

    it('should load stats on init', () => {
        component.ngOnInit();

        expect(workflowServiceMock.getAdminDashboardData).toHaveBeenCalled();
        expect(component.stats?.enAttente).toBe(2);
    });

    it('should display KPI cards correctly', () => {
        component.loadDashboard();

        expect(component.stats).toBeTruthy();
        expect(component.stats?.validesCeMois).toBe(12);
        expect(component.stats?.tauxApprobation).toBe(90);
    });

    it('should load blocked plannings', () => {
        component.loadDashboard();

        expect(component.blockedPlannings.length).toBe(1);
        expect(component.blockedPlannings[0].id).toBe(1001);
    });

    it('should load validator performance', () => {
        component.loadDashboard();

        expect(component.validatorPerformance.length).toBe(1);
        expect(component.validatorPerformance[0].nom).toContain('Dr');
    });

    it('should handle relance action', () => {
        workflowServiceMock.relancerValidateur.and.returnValue(of(void 0));

        component.onRelancer(buildBlocked()[0]);

        expect(workflowServiceMock.relancerValidateur).toHaveBeenCalledWith(1001);
        expect(notificationMock.info).toHaveBeenCalled();
    });

    it('should refresh data on button click', () => {
        spyOn(component, 'loadDashboard').and.callThrough();

        component.refresh();

        expect(component.loadDashboard).toHaveBeenCalled();
        expect(component.isRefreshing).toBeFalse();
    });

    it('should set error state when dashboard API fails', () => {
        workflowServiceMock.getAdminDashboardData.and.returnValue(throwError(() => new Error('fail')));

        component.loadDashboard();

        expect(component.hasError).toBeTrue();
        expect(component.errorMessage).toContain('Impossible de charger');
    });
});

function buildStats(): DashboardStats {
    return {
        enAttente: 2,
        depasses: 1,
        validesCeMois: 12,
        tempsMoyenValidation: 24,
        tauxApprobation: 90,
        planningsFinaux: 1,
        parService: [{ serviceName: 'Cardio', enAttente: 2, valides: 10 }],
        evolution: [{ label: 'J1', value: 4 }]
    };
}

function buildBlocked(): BlockedPlanning[] {
    return [
        {
            id: 1001,
            nom: 'Planning Mars',
            service: 'Cardiologie',
            bloqueChez: 'Validateur RH',
            bloqueChezRole: 'VALIDATEUR_RH',
            depuis: new Date().toISOString(),
            joursDepasses: 3,
            validateurId: 55,
            validateurEmail: 'rh@x.test'
        }
    ];
}

function buildPerformance(): ValidatorPerformance[] {
    return [
        {
            validateurId: 10,
            nom: 'Dr DUPONT',
            role: 'Chef Service',
            traites: 10,
            enAttente: 1,
            tempsMoyen: 20,
            performance: 'good'
        }
    ];
}
