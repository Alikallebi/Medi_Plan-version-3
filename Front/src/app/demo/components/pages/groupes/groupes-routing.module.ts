import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { GroupesComponent } from './groupes.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: GroupesComponent }
    ])
  ],
  exports: [RouterModule]
})
export class GroupesRoutingModule { }
