import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserDetailComponent } from './user-detail.component';
import { UserDetailRoutingModule } from './user-detail-routing.module';

// PrimeNG Modules
import { ButtonModule } from 'primeng/button';
import { TabViewModule } from 'primeng/tabview';
import { DialogModule } from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToastModule } from 'primeng/toast';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';

@NgModule({
  declarations: [UserDetailComponent],
  imports: [
    CommonModule,
    FormsModule,
    UserDetailRoutingModule,
    ButtonModule,
    TabViewModule,
    DialogModule,
    CalendarModule,
    DropdownModule,
    InputNumberModule,
    CheckboxModule,
    RadioButtonModule,
    ToastModule,
    ProgressBarModule,
    TooltipModule,
    MenuModule
  ]
})
export class UserDetailModule { }
