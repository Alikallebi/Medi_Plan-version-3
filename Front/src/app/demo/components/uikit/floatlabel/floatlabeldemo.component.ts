import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    templateUrl: './floatlabeldemo.component.html',
    styleUrls: ['./floatlabeldemo.component.css'] // Ajoutez cette ligne pour inclure le fichier CSS
})
export class FloatLabelDemoComponent {
    constructor(private router: Router) {}

    redirectTologin(): void {
        // Rediriger vers le composant AccessComponent
        this.router.navigate(['/auth/login']);
    }
}
