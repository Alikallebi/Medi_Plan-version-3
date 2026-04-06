import { Component, OnInit } from '@angular/core';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ServiceManagementService } from '../../../service/service-management.service';
import { StaffService } from '../../../service/staff.service';
import {
  Equipe,
  TypeEquipe,
  StatutActif,
  TypeHoraires,
  HoraireJour
} from '../../../service/equipe.service';
import { EquipeService } from '../../../service/equipe.service';

@Component({
  selector: 'app-pole',
  templateUrl: './pole.component.html',
  styleUrls: ['./pole.component.scss'],
  providers: [MessageService, ConfirmationService]
})
export class PoleComponent implements OnInit {

  equipes: Equipe[] = [];
  selectedEquipes: Equipe[] = [];
  equipeDialog: boolean = false;
  submitted: boolean = false;
  equipe: Equipe & { superviseurs?: any[] } = {};
  cols: any[] = [];
  loading: boolean = false;
  services: any[] = [];
  responsables: any[] = [];

  typesEquipe: any[] = [];
  typesHoraires: any[] = [];
  statuts: any[] = [];
  postesDisponibles: any[] = [];
  competencesDisponibles: any[] = [];

  joursHoraires: HoraireJour[] = [];

  identiteSectionCollapsed: boolean = false;
  responsablesSectionCollapsed: boolean = false;
  compositionSectionCollapsed: boolean = false;
  horairesSectionCollapsed: boolean = false;
  postesSectionCollapsed: boolean = false;
  parametresSectionCollapsed: boolean = false;

  horairesPersonnalises: HoraireJour[] = [];

  readonly StatutActif = StatutActif;

  constructor(
    private serviceService: ServiceManagementService,
    private equipeService: EquipeService,
    private staffService: StaffService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) { }

  ngOnInit(): void {
    this.loadEquipes();
    this.loadServices();
    this.loadResponsables();
    this.initializeOptions();
    this.initializeHoraires();
    this.cols = [
      { field: 'nom', header: 'Nom' },
      { field: 'code', header: 'Code' },
      { field: 'service', header: 'Service' },
      { field: 'typeEquipe', header: 'Type' },
      { field: 'statut', header: 'Statut' },
      { field: 'actions', header: 'Actions' }
    ];
  }

  initializeOptions(): void {
    this.typesEquipe = [
      { label: TypeEquipe.JOUR, value: TypeEquipe.JOUR },
      { label: TypeEquipe.NUIT, value: TypeEquipe.NUIT },
      { label: TypeEquipe.MIXTE, value: TypeEquipe.MIXTE },
      { label: TypeEquipe.GARDE, value: TypeEquipe.GARDE },
      { label: TypeEquipe.ROTATION, value: TypeEquipe.ROTATION },
      { label: TypeEquipe.SPECIFIQUE, value: TypeEquipe.SPECIFIQUE }
    ];

    this.typesHoraires = [
      { label: TypeHoraires.STANDARDS, value: TypeHoraires.STANDARDS },
      { label: TypeHoraires.PERSONNALISES, value: TypeHoraires.PERSONNALISES }
    ];

    this.statuts = [
      { label: StatutActif.ACTIF, value: StatutActif.ACTIF },
      { label: StatutActif.INACTIF, value: StatutActif.INACTIF }
    ];

    this.postesDisponibles = [
      { label: 'Matin (07h-14h)', value: 'Matin (07h-14h)' },
      { label: 'Après-midi (14h-21h)', value: 'Après-midi (14h-21h)' },
      { label: 'Nuit (21h-07h)', value: 'Nuit (21h-07h)' },
      { label: 'Garde weekend', value: 'Garde weekend' },
      { label: 'Astreinte', value: 'Astreinte' },
      { label: 'Consultation', value: 'Consultation' }
    ];

    this.competencesDisponibles = [
      { label: 'Urgences', value: 'urgences' },
      { label: 'Réanimation', value: 'reanimation' },
      { label: 'Bloc opératoire', value: 'bloc_operatoire' },
      { label: 'Pédiatrie', value: 'pediatrie' },
      { label: 'Imagerie', value: 'imagerie' },
      { label: 'Cardiologie', value: 'cardiologie' }
    ];
  }

  initializeHoraires(): void {
    const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    this.joursHoraires = jours.map(jour => ({
      jour,
      debut: jour === 'Samedi' ? '08:00' : (jour === 'Dimanche' ? '' : '07:00'),
      fin: jour === 'Samedi' ? '12:00' : (jour === 'Dimanche' ? '' : '19:00'),
      pause: jour !== 'Dimanche' && jour !== 'Samedi'
    }));
  }

  loadServices(): void {
    this.serviceService.getServices().subscribe(
      (data: any[]) => {
        this.services = data.map(s => ({ label: s.nom, value: s }));
      },
      () => {
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger les services' });
      }
    );
  }

  loadResponsables(): void {
    const serviceId = this.equipe?.service?.id;

    if (!serviceId) {
      this.responsables = [];
      return;
    }

    this.staffService.getAll(serviceId).subscribe(
      (users: any[]) => {
        this.responsables = (users ?? []).map((user) => {
          const fullName = `${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim();
          const role = (user?.role ?? '').toString().trim();
          return {
            label: role ? `${fullName} (${role})` : fullName,
            value: { id: user?.id, nom: fullName }
          };
        });

        if (this.equipe?.chefEquipe?.id) {
          const selectedStillExists = this.responsables.some(r => r?.value?.id === this.equipe.chefEquipe.id);
          if (!selectedStillExists) {
            this.equipe.chefEquipe = null;
          }
        }
      },
      () => {
        this.responsables = [];
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger les utilisateurs du service sélectionné' });
      }
    );
  }

  openNew(): void {
    this.equipe = {
      statut: StatutActif.ACTIF,
      couleur: '#f59e0b',
      capaciteMaximale: 10,
      compositionSouhaitee: { medecins: 3, infirmiers: 5, autres: 2 },
      typeHoraires: TypeHoraires.STANDARDS,
      postesAssures: [],
      competencesSpecifiques: [],
      superviseurs: [],
      equipeVolante: false,
      pauseDejeuner: { debut: '12:00', fin: '13:30' },
      dateCreation: new Date()
    };
    this.horairesPersonnalises = [...this.joursHoraires];
    this.submitted = false;
    this.loadResponsables();
    this.equipeDialog = true;
    this.resetSections();
  }

  resetSections(): void {
    this.identiteSectionCollapsed = false;
    this.responsablesSectionCollapsed = false;
    this.compositionSectionCollapsed = false;
    this.horairesSectionCollapsed = false;
    this.postesSectionCollapsed = false;
    this.parametresSectionCollapsed = false;
  }

  editEquipe(equipe: Equipe): void {
    this.equipe = {
      ...equipe,
      superviseurs: (equipe as any).superviseurs ?? [],
      compositionSouhaitee: {
        medecins: equipe.compositionSouhaitee?.medecins ?? 0,
        infirmiers: equipe.compositionSouhaitee?.infirmiers ?? 0,
        autres: equipe.compositionSouhaitee?.autres ?? 0
      }
    };
    this.horairesPersonnalises = this.equipe.horairesPersonnalises ? [...this.equipe.horairesPersonnalises] : [...this.joursHoraires];
    this.loadResponsables();
    this.equipeDialog = true;
    this.resetSections();
  }

  onServiceSelectionChange(): void {
    this.equipe.chefEquipe = null;
    this.loadResponsables();
  }

  deleteEquipe(equipe: Equipe): void {
    this.confirmationService.confirm({
      message: 'Êtes-vous sûr de vouloir supprimer cette équipe?',
      header: 'Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.equipeService.deleteEquipe(equipe.id!).subscribe(
          () => {
            this.equipes = this.equipes.filter(e => e.id !== equipe.id);
            this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Équipe supprimée' });
          },
          () => {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la suppression' });
          }
        );
      }
    });
  }

  saveEquipe(): void {
    this.submitted = true;

    if (!this.equipe.nom || !this.equipe.code || !this.equipe.service || !this.equipe.chefEquipe) {
      this.messageService.add({ severity: 'warn', summary: 'Attention', detail: 'Veuillez remplir tous les champs obligatoires' });
      return;
    }

    if (this.equipe.typeHoraires === TypeHoraires.PERSONNALISES) {
      this.equipe.horairesPersonnalises = this.horairesPersonnalises;
    }

    if (this.equipe.id) {
      this.equipeService.updateEquipe(this.equipe.id, this.equipe).subscribe(
        () => {
          const index = this.equipes.findIndex(e => e.id === this.equipe.id);
          if (index !== -1) {
            this.equipes[index] = this.equipe;
          }
          this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Équipe modifiée' });
          this.equipeDialog = false;
          this.equipe = {};
          this.loadEquipes();
        },
        () => {
          this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la modification' });
        }
      );
    } else {
      this.equipeService.createEquipe(this.equipe).subscribe(
        (newEquipe: Equipe) => {
          this.equipes.push(newEquipe);
          this.messageService.add({ severity: 'success', summary: 'Succès', detail: 'Équipe créée' });
          this.equipeDialog = false;
          this.equipe = {};
          this.loadEquipes();
        },
        () => {
          this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la création' });
        }
      );
    }
  }

  saveAndAddMembers(): void {
    if (!this.equipe.nom || !this.equipe.code || !this.equipe.service || !this.equipe.chefEquipe) {
      this.messageService.add({ severity: 'warn', summary: 'Attention', detail: 'Veuillez remplir tous les champs obligatoires' });
      return;
    }
    this.saveEquipe();
  }

  hideDialog(): void {
    this.equipeDialog = false;
    this.submitted = false;
  }

  getSeverity(statut: string | undefined): string {
    switch (statut) {
      case StatutActif.ACTIF:
        return 'success';
      case StatutActif.INACTIF:
        return 'danger';
      default:
        return 'info';
    }
  }

  get compositionSouhaitee() {
    if (!this.equipe.compositionSouhaitee) {
      this.equipe.compositionSouhaitee = { medecins: 0, infirmiers: 0, autres: 0 };
    }
    return this.equipe.compositionSouhaitee;
  }

  get identiteSectionCompleted(): boolean {
    return !!(this.equipe.nom && this.equipe.code && this.equipe.service && this.equipe.typeEquipe);
  }

  get responsablesSectionCompleted(): boolean {
    return !!this.equipe.chefEquipe;
  }

  get compositionSectionCompleted(): boolean {
    return this.getTotalComposition() > 0;
  }

  get horairesSectionCompleted(): boolean {
    return !!(this.equipe.typeHoraires && (this.equipe.capaciteMaximale ?? 0) > 0);
  }

  getMembresCount(equipe: Equipe): number {
    return Number((equipe as any).membresCount ?? (equipe.membres?.length ?? 0));
  }

  onGlobalSearch(value: string): void {
    this.globalSearch = (value ?? '').trim().toLowerCase();
    this.applyFilter();
  }

  private globalSearch = '';

  private getTypeKey(type: TypeEquipe | string | undefined): 'JOUR' | 'NUIT' | 'MIXTE' | 'GARDE' | 'AUTRE' {
    if (!type) {
      return 'AUTRE';
    }

    switch (type) {
      case TypeEquipe.JOUR:
        return 'JOUR';
      case TypeEquipe.NUIT:
        return 'NUIT';
      case TypeEquipe.MIXTE:
        return 'MIXTE';
      case TypeEquipe.GARDE:
        return 'GARDE';
      default:
        return 'AUTRE';
    }
  }
  // Propriétés à ajouter
viewMode: 'grid' | 'list' = 'list';
  filterType: 'all' | 'JOUR' | 'NUIT' | 'MIXTE' | 'GARDE' = 'all';
filteredEquipes: Equipe[] = [];

// Méthodes pour les statistiques
  getEquipesByType(type: 'JOUR' | 'NUIT' | 'MIXTE' | 'GARDE'): Equipe[] {
    return this.equipes.filter(e => this.getTypeKey(e.typeEquipe) === type);
}

getTotalComposition(): number {
  const comp = this.equipe.compositionSouhaitee || {};
  return (comp.medecins || 0) + (comp.infirmiers || 0) + 
         (comp.autres || 0);
}

getChefName(chef: any): string {
  return chef?.nom || chef?.label || 'Chef';
}

getChefInitials(chef: any): string {
  const name = this.getChefName(chef);
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

getInitialsFromName(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

getEquipeColor(equipe: Equipe): string {
  const colors = [
    'linear-gradient(145deg, #f59e0b, #d97706)',
    'linear-gradient(145deg, #0f3b5e, #1b5a7e)',
    'linear-gradient(145deg, #10b981, #059669)',
    'linear-gradient(145deg, #3b82f6, #2563eb)',
    'linear-gradient(145deg, #8b5cf6, #6d28d9)'
  ];
  return colors[equipe.id ? equipe.id % colors.length : 0];
}

getCardGradient(equipe: Equipe): string {
  const type = this.getTypeKey(equipe.typeEquipe);
  if (type === 'JOUR') return 'linear-gradient(145deg, #f59e0b, #d97706)';
  if (type === 'NUIT') return 'linear-gradient(145deg, #0f3b5e, #1b5a7e)';
  if (type === 'MIXTE') return 'linear-gradient(145deg, #3b82f6, #2563eb)';
  if (type === 'GARDE') return 'linear-gradient(145deg, #ef4444, #dc2626)';
  return 'linear-gradient(145deg, #f59e0b, #d97706)';
}

getTypeIcon(type: TypeEquipe | string | undefined): string {
  switch(this.getTypeKey(type)) {
    case 'JOUR': return 'pi pi-sun';
    case 'NUIT': return 'pi pi-moon';
    case 'MIXTE': return 'pi pi-sync';
    case 'GARDE': return 'pi pi-clock';
    default: return 'pi pi-tag';
  }
}

getTypeColor(type: TypeEquipe | string | undefined): string {
  switch(this.getTypeKey(type)) {
    case 'JOUR': return '#f59e0b';
    case 'NUIT': return '#0f3b5e';
    case 'MIXTE': return '#3b82f6';
    case 'GARDE': return '#ef4444';
    default: return '#f59e0b';
  }
}

getTypeClass(type: TypeEquipe | string | undefined): string {
  switch(this.getTypeKey(type)) {
    case 'JOUR': return 'jour';
    case 'NUIT': return 'nuit';
    case 'MIXTE': return 'mixte';
    case 'GARDE': return 'garde';
    default: return '';
  }
}

getCompositionText(equipe: Equipe): string {
  const comp = equipe.compositionSouhaitee;
  if (!comp) return '';
  const parts = [];
  if (comp.medecins) parts.push(`${comp.medecins} méd.`);
  if (comp.infirmiers) parts.push(`${comp.infirmiers} inf.`);
  if (comp.autres) parts.push(`${comp.autres} autres`);
  return parts.join(' · ');
}

// Méthodes de filtrage
filterByType(type: 'all' | 'JOUR' | 'NUIT' | 'MIXTE' | 'GARDE'): void {
  this.filterType = type;
  this.applyFilter();
}

applyFilter(): void {
  let filtered = [...this.equipes];
  
  if (this.filterType !== 'all') {
    filtered = filtered.filter(e => this.getTypeKey(e.typeEquipe) === this.filterType);
  }

  if (this.globalSearch) {
    filtered = filtered.filter(e => {
      const nom = (e.nom ?? '').toLowerCase();
      const code = (e.code ?? '').toLowerCase();
      const service = (e.service?.nom ?? '').toLowerCase();
      const chef = this.getChefName(e.chefEquipe).toLowerCase();
      return nom.includes(this.globalSearch)
        || code.includes(this.globalSearch)
        || service.includes(this.globalSearch)
        || chef.includes(this.globalSearch);
    });
  }
  
  this.filteredEquipes = filtered;
}

toggleViewMode(mode: 'grid' | 'list'): void {
  this.viewMode = mode;
}

manageMembers(equipe: Equipe): void {
  // Implémentez la logique pour gérer les membres
  console.log('Gérer les membres de', equipe.nom);
}

// Modifiez loadEquipes pour initialiser filteredEquipes
loadEquipes(): void {
  this.loading = true;
  this.equipeService.getEquipes().subscribe(
    (data: Equipe[]) => {
      this.equipes = data;
      this.applyFilter();
      this.loading = false;
    },
    () => {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger les équipes' });
      this.loading = false;
    }
  );
}
}
