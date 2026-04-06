import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NotificationsComponent } from './notifications.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: NotificationsComponent }
    ])
  ],
  exports: [RouterModule]
})
export class NotificationsRoutingModule { }
