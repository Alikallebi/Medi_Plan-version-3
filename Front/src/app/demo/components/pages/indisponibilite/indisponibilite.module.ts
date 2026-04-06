import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IndisponibiliteRoutingModule } from './indisponibilite-routing.module';
import { IndisponibiliteComponent } from './indisponibilite.component';

@NgModule({
    imports: [
        CommonModule,
        IndisponibiliteRoutingModule
    ],
    declarations: [IndisponibiliteComponent]
})
export class IndisponibiliteModule { }
