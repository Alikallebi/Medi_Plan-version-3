import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MessageService, ConfirmationService } from 'primeng/api';
import { StructureService } from './structure.service';
import { RbacService } from 'src/app/demo/service/rbac.service';
import {
  EntityStatus,
  EntityType,
  Equipe,
  EquipeType,
  NoeudArborescence,
  Pole,
  Service,
  Statistiques,
  Utilisateur,
  UserRole
} from '../../../service/models';

type NodeKind = 'POLE' | 'SERVICE' | 'EQUIPE' | 'ETABLISSEMENT';

interface FlatRow {
  niveau: string;
  nom: string;
  code: string;
  parent: string;
  responsable: string;
  effectifs: number;
  statut: EntityStatus | undefined;
  node: NoeudArborescence;
}

@Component({
  selector: 'app-services',
  templateUrl: './services.component.html',
  styleUrls: ['./services.component.scss'],
  providers: [MessageService, ConfirmationService]
})
export class ServicesComponent implements OnInit, OnDestroy {
  EntityType = EntityType;
  EntityStatus = EntityStatus;
  EquipeType = EquipeType;

  loading = false;
  showTableView = false;
  showInactive = true;
  showEffectifs = true;
  compactView = false;
  searchTerm = '';

  stats: Statistiques = {};
  treeRoot: NoeudArborescence | null = null;
  filteredNodes: NoeudArborescence[] = [];
  selectedNode: NoeudArborescence | null = null;
  flatRows: FlatRow[] = [];

  poles: Pole[] = [];
  services: Service[] = [];
  equipes: Equipe[] = [];
  utilisateurs: Utilisateur[] = [];

  poleDialog = false;
  serviceDialog = false;
  equipeDialog = false;

  poleForm: FormGroup;
  serviceForm: FormGroup;
  equipeForm: FormGroup;

  private subscriptions: Subscription[] = [];

  constructor(
    private structureService: StructureService,
    private fb: FormBuilder,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    public rbac: RbacService
  ) {
    this.poleForm = this.fb.group({
      nom: ['', Validators.required],
      code: ['', Validators.required],
      description: [''],
      chefPoleId: [null, Validators.required],
      assistantId: [null],
      couleur: ['#8b5cf6'],
      statut: [true]
    });

    this.serviceForm = this.fb.group({
      nom: ['', Validators.required],
      code: ['', Validators.required],
      poleId: [null, Validators.required],
      description: [''],
      chefServiceId: [null, Validators.required],
      cadreId: [null],
      localisation: [''],
      telephone: [''],
      email: [''],
      couleur: ['#10b981'],
      est24h: [false],
      estUrgence: [false],
      effectifMinimum: [1, Validators.required],
      statut: [true]
    });

    this.equipeForm = this.fb.group({
      nom: ['', Validators.required],
      code: ['', Validators.required],
      serviceId: [null, Validators.required],
      description: [''],
      chefEquipeId: [null, Validators.required],
      type: [EquipeType.JOUR, Validators.required],
      couleur: ['#f59e0b'],
      statut: [true]
    });
  }

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  loadAll(): void {
    this.loading = true;

    const sub1 = this.structureService.getPoles().subscribe(data => {
      this.poles = data;
      this.rebuildTable();
    });

    const sub2 = this.structureService.getServices().subscribe(data => {
      this.services = data;
      this.rebuildTable();
    });

    const sub3 = this.structureService.getEquipes().subscribe(data => {
      this.equipes = data;
      this.rebuildTable();
    });

    const sub4 = this.structureService.getUtilisateurs().subscribe(data => {
      this.utilisateurs = data;
    });

    const sub5 = this.structureService.getStatistiques().subscribe(data => {
      this.stats = data;
    });

    const sub6 = this.structureService.buildUnifiedTree().subscribe(root => {
      this.treeRoot = root;
      this.applyFilters();
      this.rebuildTable();
      this.loading = false;
    });

    this.subscriptions.push(sub1, sub2, sub3, sub4, sub5, sub6);
  }

  applyFilters(): void {
    if (!this.treeRoot?.enfants) {
      this.filteredNodes = [];
      return;
    }

    if (this.compactView) {
      this.treeRoot.enfants.forEach(node => this.collapseAll(node));
    }

    this.filteredNodes = this.filterNodes(this.treeRoot.enfants, this.searchTerm.trim().toLowerCase());
  }

  private filterNodes(nodes: NoeudArborescence[], term: string): NoeudArborescence[] {
    return nodes
      .filter(node => {
        if (!this.showInactive && node.statut === EntityStatus.INACTIF) {
          return false;
        }
        if (!term) {
          return true;
        }
        const selfMatch = (node.nom || '').toLowerCase().includes(term);
        const childMatch = (node.enfants || []).some(child => this.nodeMatches(child, term));
        return selfMatch || childMatch;
      })
      .map(node => ({
        ...node,
        enfants: (node.enfants || []).length ? this.filterNodes(node.enfants || [], term) : []
      }));
  }

  private nodeMatches(node: NoeudArborescence, term: string): boolean {
    const self = (node.nom || '').toLowerCase().includes(term);
    if (self) {
      return true;
    }
    return (node.enfants || []).some(child => this.nodeMatches(child, term));
  }

  toggleExpand(node: NoeudArborescence): void {
    node.expanded = !node.expanded;
  }

  selectNode(node: NoeudArborescence): void {
    this.selectedNode = node;
  }

  backToTree(): void {
    this.selectedNode = null;
  }

  toggleView(): void {
    this.showTableView = !this.showTableView;
  }

  openPoleDialog(): void {
    this.poleForm.reset({ couleur: '#8b5cf6', statut: true });
    this.poleDialog = true;
  }

  openServiceDialog(): void {
    this.serviceForm.reset({ couleur: '#10b981', statut: true, est24h: false, estUrgence: false, effectifMinimum: 1 });
    this.serviceDialog = true;
  }

  openEquipeDialog(): void {
    this.equipeForm.reset({ couleur: '#f59e0b', statut: true, type: EquipeType.JOUR });
    this.equipeDialog = true;
  }

  savePole(): void {
    if (this.poleForm.invalid) {
      this.poleForm.markAllAsTouched();
      return;
    }

    const form = this.poleForm.value;
    const payload: Pole = {
      id: 0,
      nom: form.nom,
      code: form.code,
      description: form.description || '',
      couleur: form.couleur,
      statut: form.statut ? EntityStatus.ACTIF : EntityStatus.INACTIF,
      chefPoleId: form.chefPoleId,
      assistantId: form.assistantId || undefined,
      effectif: { total: 0, medecins: 0, infirmiers: 0, autres: 0 },
      dateCreation: new Date(),
      dateModification: new Date(),
      services: []
    };

    const sub = this.structureService.createPole(payload).subscribe(() => {
      this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Pôle créé avec succès' });
      this.poleDialog = false;
      this.loadAll();
    });
    this.subscriptions.push(sub);
  }

  saveService(): void {
    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      return;
    }

    const form = this.serviceForm.value;
    const payload: Service = {
      id: 0,
      nom: form.nom,
      code: form.code,
      poleId: Number(form.poleId),
      description: form.description || '',
      localisation: form.localisation || '',
      telephone: form.telephone || '',
      email: form.email || '',
      couleur: form.couleur,
      statut: form.statut ? EntityStatus.ACTIF : EntityStatus.INACTIF,
      chefServiceId: form.chefServiceId,
      cadreId: form.cadreId || undefined,
      effectif: { total: 0, medecins: 0, infirmiers: 0, autres: 0 },
      dateCreation: new Date(),
      dateModification: new Date(),
      equipes: [],
      specialites: [],
      est24h: !!form.est24h,
      estUrgence: !!form.estUrgence,
      effectifMinimum: Number(form.effectifMinimum) || 1,
      lits: 0,
      tauxOccupation: 0,
      gardesParMois: 0
    };

    const sub = this.structureService.createService(payload).subscribe(() => {
      this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Service créé avec succès' });
      this.serviceDialog = false;
      this.loadAll();
    });
    this.subscriptions.push(sub);
  }

  saveEquipe(): void {
    if (this.equipeForm.invalid) {
      this.equipeForm.markAllAsTouched();
      return;
    }

    const form = this.equipeForm.value;
    const payload: Equipe = {
      id: 0,
      nom: form.nom,
      code: form.code,
      serviceId: Number(form.serviceId),
      description: form.description || '',
      type: form.type,
      couleur: form.couleur,
      statut: form.statut ? EntityStatus.ACTIF : EntityStatus.INACTIF,
      chefEquipeId: form.chefEquipeId,
      effectif: { total: 0, medecins: 0, infirmiers: 0, autres: 0 },
      dateCreation: new Date(),
      dateModification: new Date(),
      membres: []
    };

    const sub = this.structureService.createEquipe(payload).subscribe(() => {
      this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Équipe créée avec succès' });
      this.equipeDialog = false;
      this.loadAll();
    });
    this.subscriptions.push(sub);
  }

  exportStructure(): void {
    const sub = this.structureService.exporterStructure('json').subscribe(() => {
      this.messageService.add({ severity: 'info', summary: 'Export', detail: 'Export de la structure terminé' });
    });
    this.subscriptions.push(sub);
  }

  importStructure(): void {
    this.messageService.add({ severity: 'info', summary: 'Import', detail: 'Import prêt: connectez votre fichier CSV/Excel' });
  }

  deletePole(pole: Pole): void {
    this.confirmationService.confirm({
      message: `Êtes-vous sûr de vouloir supprimer le pôle "${pole.nom}" ? Tous les services associés seront également supprimés.`,
      header: 'Confirmation de suppression',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Oui, supprimer',
      rejectLabel: 'Annuler',
      accept: () => {
        const sub = this.structureService.deletePole(pole.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Pôle supprimé avec succès' });
            this.selectedNode = null;
            this.loadAll();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la suppression du pôle' });
          }
        });
        this.subscriptions.push(sub);
      }
    });
  }

  deleteService(service: Service): void {
    this.confirmationService.confirm({
      message: `Êtes-vous sûr de vouloir supprimer le service "${service.nom}" ? Toutes les équipes associées seront également supprimées.`,
      header: 'Confirmation de suppression',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Oui, supprimer',
      rejectLabel: 'Annuler',
      accept: () => {
        const sub = this.structureService.deleteService(service.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Service supprimé avec succès' });
            this.selectedNode = null;
            this.loadAll();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la suppression du service' });
          }
        });
        this.subscriptions.push(sub);
      }
    });
  }

  deleteEquipe(equipe: Equipe): void {
    this.confirmationService.confirm({
      message: `Êtes-vous sûr de vouloir supprimer l'équipe "${equipe.nom}" ?`,
      header: 'Confirmation de suppression',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Oui, supprimer',
      rejectLabel: 'Annuler',
      accept: () => {
        const sub = this.structureService.deleteEquipe(equipe.id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Équipe supprimée avec succès' });
            this.selectedNode = null;
            this.loadAll();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la suppression de l\'équipe' });
          }
        });
        this.subscriptions.push(sub);
      }
    });
  }

  getTypeLabel(type: EntityType): NodeKind {
    return type as NodeKind;
  }

  getStatusLabel(statut: EntityStatus | undefined): string {
    return statut === EntityStatus.INACTIF ? 'Inactif' : 'Actif';
  }

  getStatusSeverity(statut: EntityStatus | undefined): 'success' | 'danger' {
    return statut === EntityStatus.INACTIF ? 'danger' : 'success';
  }

  getNodeCount(node: NoeudArborescence): number {
    return node.effectif || 0;
  }

  getNodeData<T>(): T | null {
    if (!this.selectedNode?.donnees) {
      return null;
    }
    return this.selectedNode.donnees as T;
  }

  isPoleSelected(): boolean {
    return this.selectedNode?.type === EntityType.POLE;
  }

  isServiceSelected(): boolean {
    return this.selectedNode?.type === EntityType.SERVICE;
  }

  isEquipeSelected(): boolean {
    return this.selectedNode?.type === EntityType.EQUIPE;
  }

  get selectedPole(): Pole | null {
    if (!this.isPoleSelected() || !this.selectedNode?.donnees) {
      return null;
    }
    return this.selectedNode.donnees as Pole;
  }

  get selectedService(): Service | null {
    if (!this.isServiceSelected() || !this.selectedNode?.donnees) {
      return null;
    }
    return this.selectedNode.donnees as Service;
  }

  get selectedEquipe(): Equipe | null {
    if (!this.isEquipeSelected() || !this.selectedNode?.donnees) {
      return null;
    }
    return this.selectedNode.donnees as Equipe;
  }

  getPoleNameById(id: number | undefined): string {
    if (!id) {
      return '-';
    }
    return this.poles.find(p => p.id === id)?.nom || '-';
  }

  getServiceNameById(id: number | undefined): string {
    if (!id) {
      return '-';
    }
    return this.services.find(s => s.id === id)?.nom || '-';
  }

  getResponsableName(id?: number): string {
    if (!id) {
      return 'Non défini';
    }
    const user = this.utilisateurs.find(u => u.id === id);
    return user ? `${user.prenom} ${user.nom}` : 'Non défini';
  }

  get utilisateursOptions(): Array<{ label: string; value: number }> {
    return this.utilisateurs.map(user => ({
      label: `${user.prenom} ${user.nom} (${user.role})`,
      value: user.id
    }));
  }

  get polesOptions(): Array<{ label: string; value: number }> {
    return this.poles.map(pole => ({
      label: pole.nom,
      value: pole.id
    }));
  }

  get servicesOptions(): Array<{ label: string; value: number }> {
    return this.services.map(service => ({
      label: service.nom,
      value: service.id
    }));
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    this.applyFilters();
  }

  trackByNode(index: number, node: NoeudArborescence): string | number {
    return node.id;
  }

  private collapseAll(node: NoeudArborescence): void {
    node.expanded = false;
    (node.enfants || []).forEach(child => this.collapseAll(child));
  }

  private rebuildTable(): void {
    if (!this.treeRoot) {
      this.flatRows = [];
      return;
    }

    const rows: FlatRow[] = [];
    const walk = (node: NoeudArborescence, parentName: string) => {
      if (node.type !== EntityType.ETABLISSEMENT) {
        const data: any = node.donnees || {};
        rows.push({
          niveau: node.type,
          nom: node.nom || '',
          code: data.code || '-',
          parent: parentName || '-',
          responsable: node.responsable || 'Non défini',
          effectifs: node.effectif || 0,
          statut: node.statut,
          node
        });
      }

      (node.enfants || []).forEach(child => walk(child, node.nom || '-'));
    };

    walk(this.treeRoot, '-');
    this.flatRows = rows;
  }
  // Retourne une couleur pour un nœud en fonction de son type
getNodeColor(node: NoeudArborescence): string {
  switch (node.type) {
    case EntityType.POLE:
      return '#8b5cf6'; // violet
    case EntityType.SERVICE:
      return '#10b981'; // vert
    case EntityType.EQUIPE:
      return '#f59e0b'; // orange
    default:
      return '#94a3b8'; // gris pour établissement ou autre
  }
}

// Retourne une couleur pour un niveau (dans la vue tableau)
getLevelColor(level: string): string {
  switch (level) {
    case 'POLE':
      return '#8b5cf6';
    case 'SERVICE':
      return '#10b981';
    case 'EQUIPE':
      return '#f59e0b';
    default:
      return '#94a3b8';
  }
}
}
