import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { ResetPasswordComponent } from './reset-password.component';
import { ResetPasswordRoutingModule } from './reset-password-routing.module';
import { FormsModule } from '@angular/forms';


@NgModule({
    imports: [
        CommonModule,
        HttpClientModule,
        ButtonModule,
        FormsModule,
        ResetPasswordRoutingModule
        
    ],
    declarations: [ResetPasswordComponent ]
})
export class ResetPasswordModule { }
