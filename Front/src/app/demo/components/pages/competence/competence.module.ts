import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { CompetenceRoutingModule } from './competence-routing.module';
import { CompetenceComponent } from './competence.component';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { InputSwitchModule } from 'primeng/inputswitch';
import { TagModule } from 'primeng/tag';

@NgModule({
    imports: [
        CommonModule,
        ReactiveFormsModule,
        CompetenceRoutingModule,
        TableModule,
        ButtonModule,
        RippleModule,
        ToastModule,
        InputTextModule,
        DialogModule,
        ConfirmDialogModule,
        TooltipModule,
        InputTextareaModule,
        InputSwitchModule,
        TagModule
    ],
    declarations: [CompetenceComponent]
})
export class CompetenceModule { }
