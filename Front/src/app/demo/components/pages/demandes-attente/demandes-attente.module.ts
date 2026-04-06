import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { DemandesAttenteRoutingModule } from './demandes-attente-routing.module';
import { DemandesAttenteComponent } from './demandes-attente.component';

@NgModule({
    declarations: [DemandesAttenteComponent],
    imports: [CommonModule, FormsModule, ButtonModule, ToastModule, DemandesAttenteRoutingModule]
})
export class DemandesAttenteModule {}
