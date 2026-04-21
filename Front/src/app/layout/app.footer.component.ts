import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    selector: 'app-footer',
    templateUrl: './app.footer.component.html',
    styleUrls: ['./app.footer.component.css']
})
export class AppFooterComponent {
    currentYear = new Date().getFullYear();
    showSocial = false;

    constructor(private router: Router) {}

    goToSupport(event: Event): void {
        event.preventDefault();
        this.router.navigate(['/pages/support']);
    }

    goToLegal(event: Event): void {
        event.preventDefault();
        this.router.navigate(['/pages/mentions-legales']);
    }

    goToContact(event: Event): void {
        event.preventDefault();
        this.router.navigate(['/pages/contact']);
    }
}