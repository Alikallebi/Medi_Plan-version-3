import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RegisterComponent } from './register.component'; // Importez le composant d'inscription

const routes: Routes = [
  { path: '', component: RegisterComponent } // Route pour le composant d'inscription
];

@NgModule({
    imports: [RouterModule.forChild([
        { path: '', component: RegisterComponent }
    ])],
    exports: [RouterModule]
})

export class RegisterRoutingModule { }
