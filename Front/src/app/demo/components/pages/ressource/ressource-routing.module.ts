import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { RessourceComponent } from './ressource.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: RessourceComponent }
    ])
  ],
  exports: [RouterModule]
})
export class RessourceRoutingModule { }
