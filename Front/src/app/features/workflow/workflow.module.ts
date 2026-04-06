import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { AuditTrailComponent } from './components/audit-trail/audit-trail.component';
import { ApprobationModalComponent } from './components/modals/approbation-modal/approbation-modal.component';
import { AttachmentListComponent } from './components/attachment-list/attachment-list.component';
import { BlockedPlanningsComponent } from './components/blocked-plannings/blocked-plannings.component';
import { CommentSectionComponent } from './components/comment-section/comment-section.component';
import { ConfirmationModalComponent } from './components/modals/confirmation-modal/confirmation-modal.component';
import { DemandeModificationModalComponent } from './components/modals/demande-modification-modal/demande-modification-modal.component';
import { MesSoumissionsComponent } from './components/mes-soumissions/mes-soumissions.component';
import { RejetModalComponent } from './components/modals/rejet-modal/rejet-modal.component';
import { PlanningPreviewComponent } from './components/planning-preview/planning-preview.component';
import { WorkflowToastComponent } from './components/toast/workflow-toast.component';
import { ValidatorPerformanceComponent } from './components/validator-performance/validator-performance.component';
import { ValidationCardComponent } from './components/validation-card/validation-card.component';
import { ValidationDetailComponent } from './components/validation-detail/validation-detail.component';
import { ValidationInboxComponent } from './components/validation-inbox/validation-inbox.component';
import { ValidationTimelineComponent } from './components/validation-timeline/validation-timeline.component';
import { WorkflowChartsComponent } from './components/workflow-charts/workflow-charts.component';
import { KpiCardsComponent } from './components/kpi-cards/kpi-cards.component';
import { WorkflowConfigComponent } from './components/workflow-config/workflow-config.component';
import { WorkflowVisualComponent } from './components/workflow-config/workflow-visual.component';
import { RoleGuard } from './guards/role.guard';
import { PerimeterGuard } from './guards/perimeter.guard';
import { AuthGuard } from '../../auth.guard';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';

@NgModule({
    declarations: [
        ValidationInboxComponent,
        ValidationCardComponent,
        ApprobationModalComponent,
        RejetModalComponent,
        DemandeModificationModalComponent,
        ConfirmationModalComponent,
        WorkflowToastComponent,
        ValidationDetailComponent,
        ValidationTimelineComponent,
        PlanningPreviewComponent,
        
        AdminDashboardComponent,
        KpiCardsComponent,
        WorkflowChartsComponent,
        BlockedPlanningsComponent,
        ValidatorPerformanceComponent,
        WorkflowConfigComponent,
        MesSoumissionsComponent,
        WorkflowVisualComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ChartModule,
        TableModule,
        CommentSectionComponent,
        AttachmentListComponent,
        AuditTrailComponent,
        RouterModule.forChild([
            { path: '', redirectTo: 'validation-inbox', pathMatch: 'full' },
            { 
                path: 'validation-inbox', 
                component: ValidationInboxComponent,
                canActivate: [AuthGuard]
            },
            { 
                path: 'validation/:id', 
                component: ValidationDetailComponent,
                canActivate: [AuthGuard, PerimeterGuard]
            },
            {
                path: 'admin-dashboard',
                component: AdminDashboardComponent,
                canActivate: [AuthGuard]
            },
            {
                path: 'audit-trail',
                component: AuditTrailComponent,
                canActivate: [AuthGuard]
            },
            {
                path: 'workflow-config',
                component: WorkflowConfigComponent,
                canActivate: [AuthGuard]
            },
            {
                path: 'mes-soumissions',
                component: MesSoumissionsComponent,
                canActivate: [AuthGuard]
            }
        ])
    ],
    exports: [ValidationInboxComponent]
})
export class WorkflowModule {}
