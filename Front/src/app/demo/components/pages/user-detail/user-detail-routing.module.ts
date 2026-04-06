import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { UserDetailComponent } from './user-detail.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: '', component: UserDetailComponent }
    ])
  ],
  exports: [RouterModule]
})
export class UserDetailRoutingModule { }
