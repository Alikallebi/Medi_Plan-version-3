import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { AuthRoutingModule } from './auth-routing.module';
import { AccessComponent } from './access/access.component';

@NgModule({
    imports: [
        CommonModule,
        ButtonModule,
        AuthRoutingModule
    ],
    declarations: [
        AccessComponent
    ]
})
export class AuthModule { }
