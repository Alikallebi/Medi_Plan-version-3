import { AfterViewInit, Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { DashboardStats } from '../../models';

Chart.register(...registerables);

@Component({
    selector: 'app-workflow-charts',
    templateUrl: './workflow-charts.component.html',
    styleUrls: ['./workflow-charts.component.scss']
})
export class WorkflowChartsComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() stats: DashboardStats | null = null;

    @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

    selectedView: 'service' | 'validateur' | 'statut' = 'service';
    private chart: Chart | null = null;

    ngAfterViewInit(): void {
        this.renderChart();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['stats']) {
            this.renderChart();
        }
    }

    ngOnDestroy(): void {
        this.chart?.destroy();
    }

    setView(view: 'service' | 'validateur' | 'statut'): void {
        this.selectedView = view;
        this.renderChart();
    }

    private renderChart(): void {
        const canvas = this.chartCanvas?.nativeElement;
        if (!canvas || !this.stats) {
            return;
        }

        this.chart?.destroy();

        const labels = this.stats.evolution.map(item => item.label);
        const values = this.stats.evolution.map(item => item.value);

        this.chart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Validations',
                        data: values,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.15)',
                        fill: true,
                        tension: 0.35
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 }
                    }
                }
            }
        });
    }
}
