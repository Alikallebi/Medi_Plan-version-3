import { Component, Input } from '@angular/core';
import { ValidatorPerformance } from '../../models';

@Component({
    selector: 'app-validator-performance',
    templateUrl: './validator-performance.component.html',
    styleUrls: ['./validator-performance.component.scss']
})
export class ValidatorPerformanceComponent {
    @Input() items: ValidatorPerformance[] = [];

    getClass(item: ValidatorPerformance): string {
        if (item.performance === 'good') {
            return 'good';
        }
        if (item.performance === 'poor') {
            return 'poor';
        }
        return 'average';
    }

    formatTemps(heures: number): string {
        return `${(heures / 24).toFixed(1)}j`;
    }
}
