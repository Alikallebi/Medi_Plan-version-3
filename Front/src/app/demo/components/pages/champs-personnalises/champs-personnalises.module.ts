import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChampsPersonnalisesRoutingModule } from './champs-personnalises-routing.module';
import { ChampsPersonnalisesComponent } from './champs-personnalises.component';

@NgModule({
    imports: [
        CommonModule,
        ChampsPersonnalisesRoutingModule
    ],
    declarations: [ChampsPersonnalisesComponent]
})
export class ChampsPersonnalisesModule { }
