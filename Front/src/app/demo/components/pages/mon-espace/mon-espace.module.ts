import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MonEspaceRoutingModule } from './mon-espace-routing.module';
import { MonEspaceComponent } from './mon-espace.component';
import { DemandeModalComponent } from './demande-modal.component';

@NgModule({
    declarations: [MonEspaceComponent, DemandeModalComponent],
    imports: [CommonModule, FormsModule, ButtonModule, ProgressSpinnerModule, MonEspaceRoutingModule]
})
export class MonEspaceModule {}