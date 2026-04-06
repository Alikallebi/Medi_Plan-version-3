import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AccessComponent } from './access/access.component';

@NgModule({
  imports: [
    RouterModule.forChild([
      { path: 'login', loadChildren: () => import('./login/login.module').then(m => m.LoginModule) },
      { path: 'register', loadChildren: () => import('./register/register.module').then(m => m.RegisterModule) },
      { path: 'reset-password', loadChildren: () => import('./reset-password/reset-password.module').then(m => m.ResetPasswordModule) },
      { path: 'message', loadChildren: () => import('./message/message.module').then(m => m.MessageModule) },
      { path: 'access-denied', component: AccessComponent }
    ])
  ],
  exports: [RouterModule]
})
export class AuthRoutingModule { }
