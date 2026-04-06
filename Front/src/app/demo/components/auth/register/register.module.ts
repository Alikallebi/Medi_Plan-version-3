import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { RegisterRoutingModule } from './register-routing.modules';
import { RegisterComponent } from './register.component';
import { MessageService } from 'primeng/api';
import { MessagesModule } from 'primeng/messages';
import { MessageModule } from 'primeng/message';

@NgModule({
  declarations: [RegisterComponent],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    RegisterRoutingModule,
    MessagesModule,
    MessageModule
  ],
  providers: [MessageService]
})
export class RegisterModule { }
