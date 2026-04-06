import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CategorieRoutingModule } from './categorie-routing.module';
import { CategorieComponent } from './categorie.component';

@NgModule({
    imports: [
        CommonModule,
        CategorieRoutingModule
    ],
    declarations: [CategorieComponent]
})
export class CategorieModule { }
