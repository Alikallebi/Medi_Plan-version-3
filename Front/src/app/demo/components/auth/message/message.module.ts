import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';

import { MessageRoutingModule } from './message-routing.module';
import { MessageComponent } from './message.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    MessageRoutingModule
  ],
  declarations: [MessageComponent]
})
export class MessageModule { }
