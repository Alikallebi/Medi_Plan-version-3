import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MonCompteRoutingModule } from './mon-compte-routing.module';
import { MonCompteComponent } from './mon-compte.component';

@NgModule({
    declarations: [MonCompteComponent],
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        ToastModule,
        TooltipModule,
        MonCompteRoutingModule
    ]
})
export class MonCompteModule {}