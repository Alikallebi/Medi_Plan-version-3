import { of, throwError } from 'rxjs';
import { AuditTrailComponent } from '../../components/audit-trail/audit-trail.component';
import { AuditExportRequest, AuditTrailEvent, AuditTrailResponse } from '../../models';
import { NotificationService } from '../../services/notification.service';
import { WorkflowService } from '../../services/workflow.service';

describe('AuditTrailComponent', () => {
    let component: AuditTrailComponent;
    let workflowServiceMock: jasmine.SpyObj<WorkflowService>;
    let notificationMock: jasmine.SpyObj<NotificationService>;

    beforeEach(() => {
        workflowServiceMock = jasmine.createSpyObj<WorkflowService>('WorkflowService', [
            'getAuditTrailGlobal',
            'exportAuditTrail',
            'getAuditEventDetails'
        ]);
        notificationMock = jasmine.createSpyObj<NotificationService>('NotificationService', ['error']);

        workflowServiceMock.getAuditTrailGlobal.and.returnValue(of(buildResponse()));
        workflowServiceMock.exportAuditTrail.and.returnValue(of(new Blob(['x'], { type: 'text/csv' })));
        workflowServiceMock.getAuditEventDetails.and.returnValue(of(buildEvent(1)));

        component = new AuditTrailComponent(workflowServiceMock, notificationMock);
    });

    it('should load audit events on init', () => {
        component.ngOnInit();

        expect(workflowServiceMock.getAuditTrailGlobal).toHaveBeenCalled();
        expect(component.events.length).toBe(1);
        expect(component.total).toBe(1);
    });

    it('should apply filters correctly', () => {
        spyOn(component, 'loadAudit').and.callThrough();

        component.onFiltersChange({ recherche: 'cardio' });

        expect(component.filters.recherche).toBe('cardio');
        expect(component.currentPage).toBe(1);
        expect(component.loadAudit).toHaveBeenCalled();
    });

    it('should handle pagination', () => {
        spyOn(component, 'loadAudit').and.callThrough();

        component.onPageChange(3);

        expect(component.loadAudit).toHaveBeenCalled();
        expect(workflowServiceMock.getAuditTrailGlobal).toHaveBeenCalledWith(jasmine.objectContaining({ page: 3 }));
    });

    it('should export data in selected format', () => {
        const createObjectURLSpy = spyOn(window.URL, 'createObjectURL').and.returnValue('blob:test');
        const revokeSpy = spyOn(window.URL, 'revokeObjectURL');
        const anchor = { href: '', download: '', click: jasmine.createSpy('click') } as unknown as HTMLAnchorElement;
        spyOn(document, 'createElement').and.returnValue(anchor);

        const request: AuditExportRequest = {
            format: 'csv',
            scope: 'filtered',
            includePlanning: true,
            includeUser: true
        };

        component.onExport(request);

        expect(workflowServiceMock.exportAuditTrail).toHaveBeenCalled();
        expect(createObjectURLSpy).toHaveBeenCalled();
        expect((anchor.click as jasmine.Spy)).toHaveBeenCalled();
        expect(revokeSpy).toHaveBeenCalled();
    });

    it('should open detail modal on row click', () => {
        component.viewEventDetails(buildEvent(10));

        expect(workflowServiceMock.getAuditEventDetails).toHaveBeenCalledWith(10);
        expect(component.showDetailModal).toBeTrue();
        expect(component.selectedEvent?.id).toBe(1);
    });

    it('should reset filters', () => {
        component.filters = { recherche: 'to-reset', page: 3 };
        spyOn(component, 'loadAudit').and.callThrough();

        component.onResetFilters();

        expect(component.filters).toEqual({});
        expect(component.currentPage).toBe(1);
        expect(component.loadAudit).toHaveBeenCalled();
    });

    it('should handle audit load failure', () => {
        workflowServiceMock.getAuditTrailGlobal.and.returnValue(throwError(() => new Error('fail')));

        component.loadAudit();

        expect(component.error).toContain('Erreur lors du chargement');
        expect(notificationMock.error).toHaveBeenCalled();
    });
});

function buildResponse(): AuditTrailResponse {
    return {
        events: [buildEvent(1)],
        total: 1,
        page: 1,
        totalPages: 1
    };
}

function buildEvent(id: number): AuditTrailEvent {
    return {
        id,
        date: new Date().toISOString(),
        utilisateurId: 10,
        utilisateurNom: 'Admin',
        utilisateurRole: 'SUPER_ADMIN',
        typeEvenement: 'PLANNING_APPROBATION',
        planningId: 22,
        planningNom: 'Planning Mars',
        description: 'Validation',
        details: {}
    };
}
