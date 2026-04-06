import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContexteRoutingModule } from './contexte-routing.module';
import { ContexteComponent } from './contexte.component';

@NgModule({
    imports: [
        CommonModule,
        ContexteRoutingModule
    ],
    declarations: [ContexteComponent]
})
export class ContexteModule { }
