import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../../demo/service/auth.service';
import { UserContext } from '../../models/user-context.model';
import { NotificationService } from '../../services/notification.service';
import { WorkflowService } from '../../services/workflow.service';
import { WORKFLOW_MESSAGES } from '../../constants/messages';

@Component({
    selector: 'app-admin-dashboard',
    templateUrl: './admin-dashboard.component.html',
    styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
    isLoading = false;
    hasError = false;
    errorMessage = '';

    stats: any = null; // à typer selon votre modèle
    blockedPlannings: any[] = [];
    validatorPerformance: any[] = [];
    recentActivities: any[] = [];

    lastUpdated: Date | null = null;
    isRefreshing = false;

    userContext: UserContext | null = null;
    private destroy$ = new Subject<void>();

    // KPIs formatés pour l'affichage
    kpiList: any[] = [];

    // Données du graphique
    chartData: any;
    chartOptions: any;

    constructor(
        private readonly workflowService: WorkflowService,
        private readonly notification: NotificationService,
        private readonly authService: AuthService,
        private readonly router: Router
    ) {}

    ngOnInit(): void {
        this.authService.userContext$
            .pipe(takeUntil(this.destroy$))
            .subscribe(context => {
                this.userContext = context;
                if (!this.estAdministrateur) {
                    this.notification.error('Accès refusé : droits administrateur requis');
                    this.router.navigate(['/workflow/validation-inbox']);
                    return;
                }
            });

        this.loadDashboard();
        this.initChartOptions();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    get estAdministrateur(): boolean {
        if (!this.userContext) return false;
        const role = this.userContext.roleNormalized;
        return role === 'super-admin' || role === 'admin-gta';
    }
    

    loadDashboard(): void {
        this.isLoading = true;
        this.hasError = false;

        this.workflowService.getAdminDashboardData().subscribe({
            next: (data) => {
                this.stats = data.stats;
                this.blockedPlannings = data.blocked;
                this.validatorPerformance = data.performance;
                this.recentActivities = data.recentActivities || [];

                this.buildKpiList();
                this.buildChartData();
                this.lastUpdated = new Date();
                this.isLoading = false;
                this.isRefreshing = false;
            },
            error: (err) => {
                console.error(err);
                this.hasError = true;
                this.errorMessage = 'Impossible de charger le tableau de bord.';
                this.isLoading = false;
                this.isRefreshing = false;
            }
        });
    }

    refresh(): void {
        this.isRefreshing = true;
        this.loadDashboard();
    }

    retry(): void {
        this.loadDashboard();
    }

    onRelancer(planning: any): void {
        this.workflowService.relancerValidateur(planning.id).subscribe({
            next: () => this.notification.info(`Relance envoyée à ${planning.bloqueChez}`),
            error: () => this.notification.error('Erreur lors de la relance')
        });
    }

    onReaffecter(planning: any): void {
        const saisie = window.prompt('ID du nouveau validateur :');
        const validateurId = Number(saisie);
        if (!Number.isFinite(validateurId) || validateurId <= 0) return;

        this.workflowService.reaffecterValidation(planning.id, validateurId).subscribe({
            next: () => {
                this.notification.success('Validation réaffectée');
                this.refresh();
            },
            error: () => this.notification.error('Erreur lors de la réaffectation')
        });
    }

    onValiderDOffice(planning: any): void {
        this.workflowService.validerDoffice(planning.id, 'Validation d’office depuis dashboard admin').subscribe({
            next: () => {
                this.notification.success(WORKFLOW_MESSAGES.SUCCESS.APPROBATION);
                this.refresh();
            },
            error: () => this.notification.error(WORKFLOW_MESSAGES.ERROR.VALIDATION)
        });
    }

    getActivityIcon(type: string): string {
        const icons: any = {
            validation: 'pi pi-check-circle',
            rejet: 'pi pi-times-circle',
            soumission: 'pi pi-upload',
            modification: 'pi pi-pencil'
        };
        return icons[type] || 'pi pi-info-circle';
    }

    private buildKpiList(): void {
        if (!this.stats) return;
        this.kpiList = [
            {
                label: 'Total plannings',
                value: this.stats.total,
                icon: 'pi pi-file',
                color: '#3b82f6',
                trend: this.stats.trendTotal || 0
            },
            {
                label: 'En attente',
                value: this.stats.enAttente,
                icon: 'pi pi-clock',
                color: '#f59e0b',
                trend: this.stats.trendAttente || 0
            },
            {
                label: 'Validés ce mois',
                value: this.stats.validesMois,
                icon: 'pi pi-check',
                color: '#10b981',
                trend: this.stats.trendValides || 0
            },
            {
                label: 'Temps moyen validation',
                value: this.stats.tempsMoyen + 'h',
                icon: 'pi pi-hourglass',
                color: '#8b5cf6',
                trend: this.stats.trendTemps || 0
            }
        ];
    }

    private buildChartData(): void {
        // Exemple de données – à adapter avec les vraies données de stats
        this.chartData = {
            labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
            datasets: [
                {
                    label: 'Validations',
                    data: [12, 19, 15, 22, 24, 10, 8],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16,185,129,0.1)',
                    tension: 0.4
                },
                {
                    label: 'Rejets',
                    data: [3, 5, 2, 4, 6, 1, 2],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    tension: 0.4
                }
            ]
        };
    }

    private initChartOptions(): void {
        this.chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#334155' }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#e2e8f0' } }
            }
        };
    }
}