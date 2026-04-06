import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { StaffComponent } from './staff.component';

@NgModule({
  imports: [RouterModule.forChild([
    { path: '', component: StaffComponent }
  ])],
  exports: [RouterModule]
})
export class StaffRoutingModule { }
