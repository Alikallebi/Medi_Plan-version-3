import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoriqueRoutingModule } from './historique-routing.module';
import { HistoriqueComponent } from './historique.component';

@NgModule({
    imports: [
        CommonModule,
        HistoriqueRoutingModule
    ],
    declarations: [HistoriqueComponent]
})
export class HistoriqueModule { }
