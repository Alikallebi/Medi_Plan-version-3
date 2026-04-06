import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ChampsPersonnalisesComponent } from './champs-personnalises.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: ChampsPersonnalisesComponent }
    ])
  ],
  exports: [RouterModule]
})
export class ChampsPersonnalisesRoutingModule { }
