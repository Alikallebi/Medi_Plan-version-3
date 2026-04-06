import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { AuthService } from 'src/app/demo/service/auth.service';
import { DemandeHistoriqueItem, DemandeItem } from 'src/app/demo/models/demande.model';
import { DemandeService } from 'src/app/demo/service/demande.service';

@Component({
    selector: 'app-demandes-attente',
    templateUrl: './demandes-attente.component.html',
    styleUrls: ['./demandes-attente.component.scss'],
    providers: [MessageService]
})
export class DemandesAttenteComponent implements OnInit {
    loading = false;
    requests: DemandeItem[] = [];
    selectedRequest: DemandeItem | null = null;
    rejectReason = '';
    actionLoading = false;
    expandedHistoryId: number | null = null;
    historyLoading = false;
    historyMap: Record<number, DemandeHistoriqueItem[]> = {};

    constructor(
        private readonly demandeService: DemandeService,
        private readonly authService: AuthService,
        private readonly messageService: MessageService
    ) {}

    ngOnInit(): void {
        this.loadRequests();
    }

    loadRequests(): void {
        const currentUser = this.authService.getCurrentUser();
        const validatorId = currentUser?.id ?? 0;
        if (!validatorId) {
            this.requests = [];
            this.loading = false;
            this.messageService.add({
                severity: 'error',
                summary: 'Erreur',
                detail: 'Utilisateur validateur introuvable.'
            });
            return;
        }

        this.loading = true;
        this.demandeService.getDemandesAValider(validatorId).subscribe({
            next: rows => {
                this.requests = rows ?? [];
                this.expandedHistoryId = null;
                this.loading = false;
            },
            error: () => {
                this.requests = [];
                this.loading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: 'Impossible de charger les demandes en attente.'
                });
            }
        });
    }

    toggleHistory(request: DemandeItem): void {
        const currentUser = this.authService.getCurrentUser();
        const actingUserId = currentUser?.id ?? 0;
        if (!actingUserId) {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Utilisateur validateur introuvable.' });
            return;
        }

        if (this.expandedHistoryId === request.id) {
            this.expandedHistoryId = null;
            return;
        }

        this.expandedHistoryId = request.id;

        if (this.historyMap[request.id]) {
            return;
        }

        this.historyLoading = true;
        this.demandeService.getHistoriqueDemande(request.id, actingUserId).subscribe({
            next: rows => {
                this.historyLoading = false;
                this.historyMap[request.id] = rows ?? [];
            },
            error: (error) => {
                this.historyLoading = false;
                this.historyMap[request.id] = [];
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: error?.error?.message || 'Impossible de charger l’historique de la demande.'
                });
            }
        });
    }

    getHistoryForRequest(requestId: number): DemandeHistoriqueItem[] {
        return this.historyMap[requestId] ?? [];
    }

    getHistoryActionLabel(action: string): string {
        const normalized = `${action ?? ''}`.trim().toUpperCase();
        if (normalized === 'CREATED') {
            return 'Création';
        }

        if (normalized === 'APPROVED') {
            return 'Validation';
        }

        if (normalized === 'REJECTED') {
            return 'Rejet';
        }

        return normalized || 'Action';
    }

    getHistoryActorLabel(item: DemandeHistoriqueItem): string {
        if (item.acteurNom && item.acteurNom.trim().length > 0) {
            return item.acteurNom.trim();
        }

        if (item.acteurId) {
            return `Utilisateur #${item.acteurId}`;
        }

        return 'Système';
    }

    approve(request: DemandeItem): void {
        const currentUser = this.authService.getCurrentUser();
        const validatorId = currentUser?.id ?? 0;
        const validatorName = `${currentUser?.prenom ?? ''} ${currentUser?.nom ?? ''}`.trim() || 'Validateur';
        if (!validatorId) {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Utilisateur validateur introuvable.' });
            return;
        }

        this.actionLoading = true;
        this.demandeService.validerDemande(request.id, validatorId, validatorName).subscribe({
            next: () => {
                this.actionLoading = false;
                this.messageService.add({ severity: 'success', summary: 'Approuvée', detail: 'La demande a été approuvée.' });
                this.loadRequests();
            },
            error: (error) => {
                this.actionLoading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: error?.error?.message || 'Impossible d\'approuver la demande.'
                });
            }
        });
    }

    openReject(request: DemandeItem): void {
        this.selectedRequest = request;
        this.rejectReason = '';
    }

    cancelReject(): void {
        this.selectedRequest = null;
        this.rejectReason = '';
    }

    confirmReject(): void {
        if (!this.selectedRequest) {
            return;
        }

        const currentUser = this.authService.getCurrentUser();
        const validatorId = currentUser?.id ?? 0;
        const validatorName = `${currentUser?.prenom ?? ''} ${currentUser?.nom ?? ''}`.trim() || 'Validateur';
        if (!validatorId) {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Utilisateur validateur introuvable.' });
            return;
        }

        this.actionLoading = true;
        this.demandeService.rejeterDemande(this.selectedRequest.id, validatorId, this.rejectReason || 'Demande rejetée', validatorName).subscribe({
            next: () => {
                this.actionLoading = false;
                this.selectedRequest = null;
                this.rejectReason = '';
                this.messageService.add({ severity: 'success', summary: 'Rejetée', detail: 'La demande a été rejetée.' });
                this.loadRequests();
            },
            error: (error) => {
                this.actionLoading = false;
                this.messageService.add({
                    severity: 'error',
                    summary: 'Erreur',
                    detail: error?.error?.message || 'Impossible de rejeter la demande.'
                });
            }
        });
    }
}
