import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RessourceRoutingModule } from './ressource-routing.module';
import { RessourceComponent } from './ressource.component';

@NgModule({
    imports: [
        CommonModule,
        RessourceRoutingModule
    ],
    declarations: [RessourceComponent]
})
export class RessourceModule { }
