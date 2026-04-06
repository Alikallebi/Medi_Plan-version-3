import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PosteComponent } from './poste.component';

const routes: Routes = [
    {
        path: '',
        component: PosteComponent
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule]
})
export class PosteRoutingModule { }
