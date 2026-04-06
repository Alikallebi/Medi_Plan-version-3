import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MonCompteComponent } from './mon-compte.component';

@NgModule({
    imports: [RouterModule.forChild([{ path: '', component: MonCompteComponent }])],
    exports: [RouterModule]
})
export class MonCompteRoutingModule {}