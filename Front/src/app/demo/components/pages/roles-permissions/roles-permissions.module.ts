import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RolesPermissionsComponent } from './roles-permissions.component';
import { RolesPermissionsRoutingModule } from './roles-permissions-routing.module';

// PrimeNG
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { RadioButtonModule } from 'primeng/radiobutton';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

// Pipe personnalisé pour le filtre
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter'
})
export class FilterPipe implements PipeTransform {
  transform(items: any[], field: string, value: any): any[] {
    if (!items) return [];
    if (!field || value === undefined) return items;
    return items.filter(item => item[field] === value);
  }
}

@NgModule({
  declarations: [
    RolesPermissionsComponent,
    FilterPipe
  ],
  imports: [
    CommonModule,
    FormsModule,
    RolesPermissionsRoutingModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    DialogModule,
    RadioButtonModule,
    InputSwitchModule,
    InputTextareaModule,
    TooltipModule
  ],
  providers: [MessageService]
})
export class RolesPermissionsModule { }
