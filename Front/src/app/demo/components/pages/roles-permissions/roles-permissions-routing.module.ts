import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { RolesPermissionsComponent } from './roles-permissions.component';

@NgModule({
  imports: [RouterModule.forChild([
    { path: '', component: RolesPermissionsComponent }
  ])],
  exports: [RouterModule]
})
export class RolesPermissionsRoutingModule { }
