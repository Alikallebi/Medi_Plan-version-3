import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PlanningPageComponent } from './planning-page.component';

@NgModule({
    imports: [
        RouterModule.forChild([
            { path: '', component: PlanningPageComponent }
        ])
    ],
    exports: [RouterModule]
})
export class PlanningRoutingModule {}
