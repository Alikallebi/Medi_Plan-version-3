import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from 'src/app/demo/service/auth.service';
import { WorkflowService } from '../../services/workflow.service';

// Interface du retour MySQL pour les soumissions
export interface PlanningWeekWorkflow {
    id: number;
    serviceId: string;
    serviceName: string;
    weekStart: string;
    weekEnd: string;
    statut: string;
    workflowConfigId?: number;
    etapeActuelle: number;
    dateSoumission?: string;
    prochainValidateurId?: number;
    prochainValidateurNom?: string;
    prochainValidateurRole?: string;
    soumisParId?: number;
    soumisParNom?: string;
    rejetMotif?: string;
    assignmentsCount: number;
}

@Component({
    selector: 'app-mes-soumissions',
    templateUrl: './mes-soumissions.component.html',
    styleUrls: ['./mes-soumissions.component.scss']
})
export class MesSoumissionsComponent implements OnInit, OnDestroy {
    soumissions: PlanningWeekWorkflow[] = [];
    isLoading = false;
    hasError = false;
    errorMessage = '';
    selectedStatut = 'tous';

    private destroy$ = new Subject<void>();

    constructor(
        private readonly authService: AuthService,
        private readonly workflowService: WorkflowService,
        private readonly router: Router
    ) {}

    ngOnInit(): void {
        this.loadSoumissions();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadSoumissions(): void {
        this.isLoading = true;
        this.hasError = false;

        this.workflowService.getMesSoumissions()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: (data: any) => {
                    // Le backend retourne PlanningWeekWorkflow[] depuis MySQL
                    this.soumissions = Array.isArray(data) ? data : [];
                    this.isLoading = false;
                },
                error: (err: any) => {
                    this.hasError = true;
                    this.errorMessage = err?.error?.message || 'Impossible de charger vos soumissions.';
                    this.isLoading = false;
                }
            });
    }

    get filteredSoumissions(): PlanningWeekWorkflow[] {
        if (this.selectedStatut === 'tous') return this.soumissions;
        return this.soumissions.filter(s => s.statut === this.selectedStatut);
    }

    getStatutLabel(statut: string): string {
        const labels: Record<string, string> = {
            'BROUILLON': 'Brouillon',
            'EN_ATTENTE_VALIDATION': 'En attente',
            'EN_ATTENTE_VALIDATION_FINALE': 'Validation finale',
            'VALIDE': 'Validé',
            'REJETE': 'Rejeté'
        };
        return labels[statut] ?? statut;
    }

    getStatutClass(statut: string): string {
        const classes: Record<string, string> = {
            'BROUILLON': 'badge-draft',
            'EN_ATTENTE_VALIDATION': 'badge-pending',
            'EN_ATTENTE_VALIDATION_FINALE': 'badge-final',
            'VALIDE': 'badge-approved',
            'REJETE': 'badge-rejected'
        };
        return classes[statut] ?? 'badge-default';
    }

    getStatutIcon(statut: string): string {
        const icons: Record<string, string> = {
            'BROUILLON': '📝',
            'EN_ATTENTE_VALIDATION': '⏳',
            'EN_ATTENTE_VALIDATION_FINALE': '🔍',
            'VALIDE': '✅',
            'REJETE': '❌'
        };
        return icons[statut] ?? '📋';
    }

    formatDate(dateStr?: string): string {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleDateString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    }

    formatWeek(weekStart: string): string {
        try {
            const d = new Date(weekStart);
            const end = new Date(d);
            end.setDate(d.getDate() + 6);
            return `Semaine du ${this.formatDate(weekStart)} au ${this.formatDate(end.toISOString())}`;
        } catch {
            return weekStart;
        }
    }

    getRoleLabel(role?: string): string {
        if (!role) return 'Rôle non défini';

        const normalized = role
            .toUpperCase()
            .replace(/\s+/g, '_')
            .replace(/-/g, '_')
            .replace(/É/g, 'E')
            .replace(/È/g, 'E')
            .replace(/Ê/g, 'E');

        const labels: Record<string, string> = {
            CHEF_SERVICE: 'Chef de service',
            CHEF_DE_SERVICE: 'Chef de service',
            CHEF_POLE: 'Chef de pôle',
            CHEF_DE_POLE: 'Chef de pôle',
            VALIDATEUR_RH: 'Validateur RH',
            SUPER_ADMIN: 'Super administrateur',
            ADMIN_GTA: 'Admin GTA'
        };

        return labels[normalized] || role;
    }

    getJoursDepuis(dateStr?: string): number {
        if (!dateStr) return 0;
        return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    }

    voirDetail(soumission: PlanningWeekWorkflow): void {
        this.router.navigate(['/workflow/validation', soumission.id], {
            queryParams: { mode: 'suivi' }
        });
    }

    soumettrePlanning(soumission: PlanningWeekWorkflow): void {
        if (!confirm(`Soumettre le planning "${soumission.serviceName}" pour validation ?`)) return;
        this.workflowService.soumettrePlanning(soumission.id).subscribe({
            next: () => this.loadSoumissions(),
            error: (err: any) => alert(err?.error?.message || 'Erreur lors de la soumission.')
        });
    }

    retourPlanning(): void {
        this.router.navigate(['/pages/planning']);
    }

    get totalEnAttente(): number {
        return this.soumissions.filter(s =>
            s.statut === 'EN_ATTENTE_VALIDATION' || s.statut === 'EN_ATTENTE_VALIDATION_FINALE').length;
    }
    get totalValides(): number { return this.soumissions.filter(s => s.statut === 'VALIDE').length; }
    get totalRejetes(): number { return this.soumissions.filter(s => s.statut === 'REJETE').length; }
}
