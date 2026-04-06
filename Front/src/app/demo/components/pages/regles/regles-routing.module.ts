import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ReglesComponent } from './regles.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: ReglesComponent }
    ])
  ],
  exports: [RouterModule]
})
export class ReglesRoutingModule { }
