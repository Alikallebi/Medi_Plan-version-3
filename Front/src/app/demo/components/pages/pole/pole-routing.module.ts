import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PoleComponent } from './pole.component';

const routes: Routes = [
    {
        path: '',
        component: PoleComponent
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PoleRoutingModule { }
