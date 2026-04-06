import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MonEspaceComponent } from './mon-espace.component';

@NgModule({
    imports: [RouterModule.forChild([{ path: '', component: MonEspaceComponent }])],
    exports: [RouterModule]
})
export class MonEspaceRoutingModule {}