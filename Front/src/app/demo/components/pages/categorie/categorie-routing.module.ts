import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CategorieComponent } from './categorie.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: CategorieComponent }
    ])
  ],
  exports: [RouterModule]
})
export class CategorieRoutingModule { }
