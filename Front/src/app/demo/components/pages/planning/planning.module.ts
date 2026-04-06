import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlanningRoutingModule } from './planning-routing.module';
import { PlanningPageComponent } from './planning-page.component';
import { PlanningToolbarComponent } from './planning-toolbar.component';
import { PersonnelListComponent } from './personnel-list.component';
import { WeeklyPlanningComponent } from './weekly-planning.component';
import { PlanningCellComponent } from './planning-cell.component';
import { RulesPanelComponent } from './rules-panel.component';
import { DragDropDirective } from './directives/drag-drop.directive';
import { DropZoneDirective } from './directives/drop-zone.directive';
import { ServicePickerComponent } from './service-picker.component';

@NgModule({
    declarations: [
        PlanningPageComponent,
        PlanningToolbarComponent,
        PersonnelListComponent,
        WeeklyPlanningComponent,
        PlanningCellComponent,
        RulesPanelComponent,
        DragDropDirective,
        DropZoneDirective,
        ServicePickerComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        PlanningRoutingModule
    ]
})
export class PlanningModule {}
