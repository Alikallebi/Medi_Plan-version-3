import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormLayoutComponent } from './formlayout.component';
import { FormlayoutRoutingModule } from './formlayout-routing.module';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { FullCalendarModule } from '@fullcalendar/angular';
import { MessagesModule } from 'primeng/messages';
import {SpeedDialModule} from 'primeng/speeddial';
import {DialogModule} from 'primeng/dialog';
import {CalendarModule} from 'primeng/calendar';
import {DropdownModule} from 'primeng/dropdown';



@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    InputTextareaModule,
    ButtonModule,
    FormlayoutRoutingModule,
    FullCalendarModule,
    SpeedDialModule,
    DialogModule,
    MessagesModule,
    CalendarModule,
    DropdownModule
  ],
  declarations: [FormLayoutComponent]
})
export class FormlayoutModule { }
