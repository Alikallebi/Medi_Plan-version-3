import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DemandesAttenteComponent } from './demandes-attente.component';

const routes: Routes = [{ path: '', component: DemandesAttenteComponent }];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class DemandesAttenteRoutingModule {}
