import { Component, Input } from '@angular/core';
import { DashboardStats } from '../../models';

@Component({
    selector: 'app-kpi-cards',
    templateUrl: './kpi-cards.component.html',
    styleUrls: ['./kpi-cards.component.scss']
})
export class KpiCardsComponent {
    @Input() stats!: DashboardStats;

    get tempsMoyenLabel(): string {
        const jours = this.stats?.tempsMoyenValidation ? this.stats.tempsMoyenValidation / 24 : 0;
        return `${jours.toFixed(1)}j`;
    }
}
