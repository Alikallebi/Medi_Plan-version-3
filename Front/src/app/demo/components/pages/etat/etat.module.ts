import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EtatRoutingModule } from './etat-routing.module';
import { EtatComponent } from './etat.component';

@NgModule({
    imports: [
        CommonModule,
        EtatRoutingModule
    ],
    declarations: [EtatComponent]
})
export class EtatModule { }
