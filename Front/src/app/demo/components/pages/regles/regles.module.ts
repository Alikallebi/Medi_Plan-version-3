import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ReglesRoutingModule } from './regles-routing.module';
import { ReglesComponent } from './regles.component';

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
import { DropdownModule } from 'primeng/dropdown';
import { TagModule } from 'primeng/tag';
import { InputNumberModule } from 'primeng/inputnumber';
import { TabViewModule } from 'primeng/tabview';
import { TimelineModule } from 'primeng/timeline';
import { CalendarModule } from 'primeng/calendar';
import { ChipsModule } from 'primeng/chips';
import { StepsModule } from 'primeng/steps';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ReglesRoutingModule,
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
    DropdownModule,
    TagModule,
    InputNumberModule,
    TabViewModule,
    TimelineModule,
    CalendarModule,
    ChipsModule,
    StepsModule,
    ProgressSpinnerModule
  ],
  declarations: [ReglesComponent],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
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
    DropdownModule,
    TagModule,
    InputNumberModule,
    TabViewModule,
    TimelineModule,
    CalendarModule,
    ChipsModule,
    StepsModule,
    ProgressSpinnerModule
  ]
})
export class ReglesModule { }
