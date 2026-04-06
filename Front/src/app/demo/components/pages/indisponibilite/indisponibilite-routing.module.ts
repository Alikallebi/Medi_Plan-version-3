import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IndisponibiliteComponent } from './indisponibilite.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: IndisponibiliteComponent }
    ])
  ],
  exports: [RouterModule]
})
export class IndisponibiliteRoutingModule { }
