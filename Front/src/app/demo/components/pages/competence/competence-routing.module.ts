import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CompetenceComponent } from './competence.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: CompetenceComponent }
    ])
  ],
  exports: [RouterModule]
})
export class CompetenceRoutingModule { }
