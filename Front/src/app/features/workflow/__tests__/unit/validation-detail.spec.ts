import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ValidationDetailComponent } from '../../components/validation-detail/validation-detail.component';
import { AttachmentService, WorkflowAttachment } from '../../services/attachment.service';
import { NotificationService } from '../../services/notification.service';
import { WorkflowPlanningDetail, WorkflowService } from '../../services/workflow.service';
import { AuthService } from '../../../../demo/service/auth.service';
import { UserContext } from '../../models/user-context.model';

describe('ValidationDetailComponent', () => {
    let component: ValidationDetailComponent;
    let routeMock: ActivatedRoute;
    let routerMock: jasmine.SpyObj<Router>;
    let workflowServiceMock: jasmine.SpyObj<WorkflowService>;
    let notificationMock: jasmine.SpyObj<NotificationService>;
    let attachmentServiceMock: jasmine.SpyObj<AttachmentService>;
    let authServiceMock: jasmine.SpyObj<AuthService>;

    beforeEach(() => {
        routeMock = {
            snapshot: {
                paramMap: convertToParamMap({ id: '101' })
            }
        } as unknown as ActivatedRoute;

        routerMock = jasmine.createSpyObj<Router>('Router', ['navigate']);
        workflowServiceMock = jasmine.createSpyObj<WorkflowService>('WorkflowService', [
            'getPlanningWithWorkflow',
            'getPlanningComments',
            'approuverEtape',
            'rejeterPlanning',
            'demanderModification',
            'addPlanningComment',
            'exportAudit'
        ]);
        notificationMock = jasmine.createSpyObj<NotificationService>('NotificationService', ['success', 'error', 'warning', 'info']);
        attachmentServiceMock = jasmine.createSpyObj<AttachmentService>('AttachmentService', [
            'getAttachments',
            'uploadAttachment',
            'deleteAttachment'
        ]);

        workflowServiceMock.getPlanningComments.and.returnValue(of([]));
        attachmentServiceMock.getAttachments.and.returnValue(of([]));

        const mockUserContext: UserContext = {
            id: 1,
            nom: 'Test',
            prenom: 'User',
            nomComplet: 'Test User',
            email: 'test@example.com',
            role: 'VALIDATOR',
            roleNormalized: 'validateur-rh',
            permissions: {
                canValidate: true,
                canConfigure: false,
                canViewAdmin: false,
                canViewAudit: false,
                canValidateFinal: false,
                canCreatePlanning: false,
                canComment: true,
                canAttachFiles: true
            },
            estActif: true
        };

        authServiceMock = jasmine.createSpyObj<AuthService>('AuthService', ['getUserContext'], {
            userContext$: of(mockUserContext)
        });
        Object.defineProperty(authServiceMock, 'getUserContext', {
            value: () => mockUserContext
        });

        component = new ValidationDetailComponent(
            routeMock,
            routerMock,
            workflowServiceMock,
            notificationMock,
            attachmentServiceMock,
            authServiceMock
        );
    });

    it('should load planning on init', () => {
        spyOn(component, 'loadPlanning');

        component.ngOnInit();

        expect(component.loadPlanning).toHaveBeenCalledWith('101');
    });

    it('should show loading state while fetching', () => {
        const pending = new Subject<WorkflowPlanningDetail>();
        workflowServiceMock.getPlanningWithWorkflow.and.returnValue(pending.asObservable());

        component.loadPlanning('101');

        expect(component.isLoading).toBeTrue();
        pending.complete();
    });

    it('should display error message on API failure', () => {
        workflowServiceMock.getPlanningWithWorkflow.and.returnValue(throwError(() => new Error('fail')));

        component.loadPlanning('101');

        expect(component.hasError).toBeTrue();
        expect(component.errorMessage).toContain('Erreur lors du chargement');
        expect(component.isLoading).toBeFalse();
    });

    it('should load comments and attachments', () => {
        workflowServiceMock.getPlanningWithWorkflow.and.returnValue(of(buildDetailMock()));
        workflowServiceMock.getPlanningComments.and.returnValue(of([
            {
                id: 'c1',
                planningId: '101',
                auteurNom: 'RH',
                auteurRole: 'VALIDATEUR_RH',
                message: 'OK',
                createdAt: new Date().toISOString()
            }
        ]));
        attachmentServiceMock.getAttachments.and.returnValue(of([
            {
                id: 'a1',
                fileName: 'justif.pdf',
                fileType: 'application/pdf',
                size: 150,
                uploadedAt: new Date().toISOString(),
                uploadedBy: 'RH'
            } as WorkflowAttachment
        ]));

        component.loadPlanning('101');

        expect(component.comments.length).toBe(1);
        expect(component.attachments.length).toBe(1);
        expect(workflowServiceMock.getPlanningComments).toHaveBeenCalledWith(101);
        expect(attachmentServiceMock.getAttachments).toHaveBeenCalledWith(101);
    });

    it('should open approval modal with correct data', () => {
        const detail = buildDetailMock();
        component.planning = detail.planning;
        component.validationStatus = detail.validationStatus;

        component.ouvrirModalApprobation();

        expect(component.showApprobationModal).toBeTrue();
    });

    it('should refresh after action', () => {
        const detail = buildDetailMock();
        component.planning = detail.planning;
        component.validationStatus = detail.validationStatus;
        spyOn(component, 'loadPlanning');
        workflowServiceMock.approuverEtape.and.returnValue(of(detail.planning));

        component.onApprobationConfirm({
            commentaire: 'Validé',
            notifierCreateur: true,
            notifierAutresValidateurs: false
        });

        expect(workflowServiceMock.approuverEtape).toHaveBeenCalledWith(101, 'Validé');
        expect(component.loadPlanning).toHaveBeenCalledWith('101');
    });

    it('should navigate back on "Retour" click', () => {
        component.retourInbox();

        expect(routerMock.navigate).toHaveBeenCalledWith(['/workflow/validation-inbox']);
    });
});

function buildDetailMock(): WorkflowPlanningDetail {
    return {
        planning: {
            id: '101',
            serviceId: '10',
            serviceName: 'Cardiologie',
            weekStart: new Date('2026-02-01T00:00:00Z'),
            weekEnd: new Date('2026-02-07T00:00:00Z'),
            assignments: [],
            personnel: [],
            rules: [],
            conflicts: [],
            history: [
                {
                    id: 'h1',
                    at: new Date('2026-02-01T09:00:00Z'),
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
            lockVersion: 1
        },
        validationStatus: {
            status: 'EN_ATTENTE_N1',
            currentStepIndex: 0,
            changedAt: new Date().toISOString(),
            changedBy: 'Dr Test'
        },
        historique: [],
        etapes: [
            {
                id: 'e1',
                order: 1,
                label: 'Validation N1',
                validatorRole: 'CHEF_SERVICE',
                isActive: true
            }
        ]
    };
}
