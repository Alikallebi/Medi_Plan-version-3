import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HistoriqueComponent } from './historique.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: HistoriqueComponent }
    ])
  ],
  exports: [RouterModule]
})
export class HistoriqueRoutingModule { }
