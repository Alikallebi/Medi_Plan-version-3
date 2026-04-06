import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ContexteComponent } from './contexte.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: ContexteComponent }
    ])
  ],
  exports: [RouterModule]
})
export class ContexteRoutingModule { }
