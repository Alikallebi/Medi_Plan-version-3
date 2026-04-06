import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    selector: 'app-access',
    templateUrl: './access.component.html',
    styles: [
        `
        .access-shell {
            border-radius: 56px;
            padding: 0.3rem;
            background: linear-gradient(180deg, rgba(239, 68, 68, 0.4) 10%, rgba(239, 68, 68, 0) 30%);
        }

        .access-card {
            border-radius: 53px;
        }
        `
    ]
})
export class AccessComponent {
    constructor(private router: Router) {}

    goHome(): void {
        this.router.navigate(['/dashboard']);
    }
}
