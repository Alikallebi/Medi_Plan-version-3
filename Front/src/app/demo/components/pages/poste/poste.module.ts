import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PosteRoutingModule } from './poste-routing.module';
import { PosteComponent } from './poste.component';

// PrimeNG imports
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TabViewModule } from 'primeng/tabview';
import { CalendarModule } from 'primeng/calendar';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { InputSwitchModule } from 'primeng/inputswitch';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { SkeletonModule } from 'primeng/skeleton';
import { ColorPickerModule } from 'primeng/colorpicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { FileUploadModule } from 'primeng/fileupload';

@NgModule({
    declarations: [
        PosteComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        PosteRoutingModule,
        ButtonModule,
        InputTextModule,
        DropdownModule,
        MultiSelectModule,
        TableModule,
        DialogModule,
        ToastModule,
        TabViewModule,
        CalendarModule,
        InputTextareaModule,
        InputSwitchModule,
        CheckboxModule,
        TooltipModule,
        MenuModule,
        SkeletonModule,
        ColorPickerModule,
        InputNumberModule,
        FileUploadModule
    ]
})
export class PosteModule { }
