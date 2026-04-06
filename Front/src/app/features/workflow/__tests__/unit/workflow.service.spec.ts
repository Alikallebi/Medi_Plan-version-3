import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { AuditTrailFilter, AuditTrailResponse, DashboardStats, PlanningWorkflow, WorkflowConfig } from '../../models';
import { WorkflowService } from '../../services/workflow.service';

describe('WorkflowService', () => {
    let service: WorkflowService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [WorkflowService]
        });

        service = TestBed.inject(WorkflowService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
    });

    it('getWorkflowConfigs should return an Observable and call configs endpoint', () => {
        const configs$: Observable<WorkflowConfig[]> = service.getWorkflowConfigs();
        expect(configs$).toBeTruthy();

        const mockConfigs = [
            {
                id: 'wf-1',
                serviceId: '10',
                version: 1,
                steps: [],
                isActive: true,
                superAdminFinalRequired: true,
                createdBy: 'admin',
                createdAt: new Date().toISOString()
            }
        ] as WorkflowConfig[];

        let result: WorkflowConfig[] | undefined;
        configs$.subscribe(value => {
            result = value;
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/configs'));
        expect(req.request.method).toBe('GET');
        req.flush(mockConfigs);

        expect(result).toEqual(mockConfigs);
    });

    it('getWorkflowConfigs should propagate API errors', () => {
        let capturedStatus: number | undefined;

        service.getWorkflowConfigs().subscribe({
            next: () => fail('expected error'),
            error: (error) => {
                capturedStatus = error.status;
            }
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/configs'));
        req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

        expect(capturedStatus).toBe(500);
    });

    it('soumettrePlanning should send payload and return response', () => {
        const planningId = 12;
        const message = 'Soumission pour validation';
        const planning = { id: '12' } as PlanningWorkflow;

        let response: PlanningWorkflow | undefined;
        service.soumettrePlanning(planningId, message).subscribe(value => {
            response = value;
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/plannings/12/soumettre'));
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ message });
        req.flush(planning);

        expect(response).toEqual(planning);
    });

    it('soumettrePlanning should surface timeout/network-like errors', () => {
        let statusCode: number | undefined;

        service.soumettrePlanning(9, 'x').subscribe({
            next: () => fail('expected timeout-like error'),
            error: (error) => {
                statusCode = error.status;
            }
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/plannings/9/soumettre'));
        req.flush('network error', { status: 0, statusText: 'Unknown Error' });

        expect(statusCode).toBe(0);
    });

    it('approuverEtape should call approval endpoint', () => {
        service.approuverEtape(77, 'OK').subscribe();

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/plannings/77/approuver'));
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ planningId: 77, commentaire: 'OK' });
        req.flush({ id: '77' } as PlanningWorkflow);
    });

    it('approuverEtape should handle 404 errors', () => {
        let capturedStatus: number | undefined;

        service.approuverEtape(404, 'not found').subscribe({
            next: () => fail('expected 404'),
            error: (error) => {
                capturedStatus = error.status;
            }
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/plannings/404/approuver'));
        req.flush({ message: 'missing' }, { status: 404, statusText: 'Not Found' });

        expect(capturedStatus).toBe(404);
    });

    it('rejeterPlanning should send motif and commentaire', () => {
        service.rejeterPlanning(15, 'Conflit de garde', 'Veuillez corriger').subscribe();

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/plannings/15/rejeter'));
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            planningId: 15,
            motif: 'Conflit de garde',
            commentaire: 'Veuillez corriger'
        });
        req.flush({ id: '15' } as PlanningWorkflow);
    });

    it('getPlanningsAValiderParRole should apply user role filter query param', () => {
        service.getPlanningsAValiderParRole('CHEF_SERVICE').subscribe();

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/plannings/en-attente'));
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('role')).toBe('CHEF_SERVICE');
        req.flush([]);
    });

    it('getDashboardStats should return API data structure when endpoint succeeds', () => {
        const stats: DashboardStats = {
            enAttente: 1,
            depasses: 0,
            validesCeMois: 10,
            tempsMoyenValidation: 20,
            tauxApprobation: 95,
            planningsFinaux: 2,
            parService: [{ serviceName: 'Urgences', enAttente: 1, valides: 9 }],
            evolution: [{ label: 'J1', value: 2 }]
        };

        let result: DashboardStats | undefined;
        service.getDashboardStats().subscribe(value => {
            result = value;
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/admin/stats'));
        expect(req.request.method).toBe('GET');
        req.flush(stats);

        expect(result).toEqual(stats);
    });

    it('getDashboardStats should fallback to mock data on API error', () => {
        let result: DashboardStats | undefined;
        service.getDashboardStats().subscribe(value => {
            result = value;
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/admin/stats'));
        req.flush({ message: 'down' }, { status: 500, statusText: 'Server Error' });

        expect(result).toBeTruthy();
        expect(result?.enAttente).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(result?.parService)).toBeTrue();
        expect(Array.isArray(result?.evolution)).toBeTrue();
    });

    it('getAuditTrailGlobal should apply filters including pagination', () => {
        const filters: AuditTrailFilter = {
            utilisateurId: 42,
            planningId: 1001,
            typeEvenement: ['PLANNING_APPROBATION', 'EXPORT'],
            recherche: 'cardio',
            page: 2,
            limit: 5
        };

        const mockResponse: AuditTrailResponse = {
            events: [],
            total: 0,
            page: 2,
            totalPages: 1
        };

        let response: AuditTrailResponse | undefined;
        service.getAuditTrailGlobal(filters).subscribe(value => {
            response = value;
        });

        const req = httpMock.expectOne(request => request.url.endsWith('/api/workflow/audit'));
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('utilisateurId')).toBe('42');
        expect(req.request.params.get('planningId')).toBe('1001');
        expect(req.request.params.getAll('typeEvenement')).toEqual(['PLANNING_APPROBATION', 'EXPORT']);
        expect(req.request.params.get('recherche')).toBe('cardio');
        expect(req.request.params.get('page')).toBe('2');
        expect(req.request.params.get('limit')).toBe('5');
        req.flush(mockResponse);

        expect(response).toEqual(mockResponse);
    });
});
