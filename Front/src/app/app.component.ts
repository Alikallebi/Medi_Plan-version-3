import { Component } from '@angular/core';
import { PrimeNGConfig } from 'primeng/api';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
@Component({
    selector: 'app-root',
    templateUrl: './app.component.html'
})
export class AppComponent {

    menuMode = 'static';
    showChatbot = true;
    private readonly destroy$ = new Subject<void>();

    constructor(private primengConfig: PrimeNGConfig, private router: Router) { }

    ngOnInit() {
        this.primengConfig.ripple = true;
        document.documentElement.style.fontSize = '14px';

        this.updateChatbotVisibility(this.router.url);
        this.router.events
            .pipe(
                filter((event): event is NavigationEnd => event instanceof NavigationEnd),
                takeUntil(this.destroy$)
            )
            .subscribe(event => {
                this.updateChatbotVisibility(event.urlAfterRedirects || event.url);
            });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private updateChatbotVisibility(url: string): void {
        const route = (url || '').toLowerCase();
        this.showChatbot = !route.startsWith('/auth');
    }
}
