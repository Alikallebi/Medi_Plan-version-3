import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { EtatComponent } from './etat.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: EtatComponent }
    ])
  ],
  exports: [RouterModule]
})
export class EtatRoutingModule { }
