import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Competence, CompetenceService } from '../../../service/competence.service';
import { RbacService } from 'src/app/demo/service/rbac.service';

@Component({
  selector: 'app-competence',
  templateUrl: './competence.component.html',
  styleUrls: ['./competence.component.css'],
  providers: [MessageService, ConfirmationService]
})
export class CompetenceComponent implements OnInit {
  competences: Competence[] = [];
  competenceDialog = false;
  submitted = false;
  loading = false;
  globalFilterValue = '';
  competenceForm: FormGroup;
  editingId: number | null = null;

  constructor(
    private competenceService: CompetenceService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private formBuilder: FormBuilder,
    public rbac: RbacService
  ) {
    this.competenceForm = this.formBuilder.group({
      nom: ['', Validators.required],
      domaine: ['Général', Validators.required],
      description: [''],
      actif: [true]
    });
  }

  ngOnInit(): void {
    this.loadCompetences();
  }

  get nomControl() {
    return this.competenceForm.get('nom');
  }

  openNew(): void {
    this.editingId = null;
    this.submitted = false;
    this.competenceForm.reset({ nom: '', domaine: 'Général', description: '', actif: true });
    this.competenceDialog = true;
  }

  editCompetence(competence: Competence): void {
    this.editingId = competence.id;
    this.submitted = false;
    this.competenceForm.reset({
      nom: competence.nom,
      domaine: competence.domaine || 'Général',
      description: competence.description || '',
      actif: competence.actif ?? competence.isActive ?? true
    });
    this.competenceDialog = true;
  }

  deleteCompetence(competence: Competence): void {
    this.confirmationService.confirm({
      message: 'Etes-vous sur de vouloir supprimer cette competence?',
      header: 'Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.competenceService.deleteCompetence(competence.id).subscribe(
          () => {
            this.loadCompetences();
            this.messageService.add({ severity: 'success', summary: 'Succes', detail: 'Competence supprimee' });
          },
          () => {
            this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la suppression' });
          }
        );
      }
    });
  }

  saveCompetence(): void {
    this.submitted = true;

    const nomValue = (this.competenceForm.value.nom || '').trim();
    const domaineValue = (this.competenceForm.value.domaine || '').trim() || 'Général';
    if (!nomValue) {
      this.nomControl?.setErrors({ required: true });
      return;
    }

    this.competenceForm.patchValue({ nom: nomValue, domaine: domaineValue });

    const payload: Omit<Competence, 'id'> = {
      nom: nomValue,
      domaine: domaineValue,
      description: this.competenceForm.value.description || '',
      actif: !!this.competenceForm.value.actif
    };

    if (this.competenceForm.invalid) {
      return;
    }

    if (this.editingId) {
      this.competenceService.updateCompetence(this.editingId, payload).subscribe(
        () => {
          this.loadCompetences();
          this.messageService.add({ severity: 'success', summary: 'Succes', detail: 'Competence modifiee' });
          this.competenceDialog = false;
        },
        () => {
          this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la modification' });
        }
      );
    } else {
      this.competenceService.createCompetence(payload).subscribe(
        () => {
          this.loadCompetences();
          this.messageService.add({ severity: 'success', summary: 'Succes', detail: 'Competence creee' });
          this.competenceDialog = false;
        },
        () => {
          this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la creation' });
        }
      );
    }
  }

  hideDialog(): void {
    this.competenceDialog = false;
    this.submitted = false;
  }

// Ajoutez ces propriétés
viewMode: 'grid' | 'list' = 'list';
filterStatus: 'all' | 'active' | 'inactive' = 'all';
filteredCompetences: Competence[] = [];

// Ajoutez ces méthodes
getActiveCount(): number {
  return this.competences.filter(c => c.actif).length;
}

getPersonnelCount(): number {
  return this.competences.reduce((acc, curr) => acc + this.getCompetencePersonnelCount(curr), 0);
}

getCompetencePersonnelCount(competence: Competence): number {
  return 0;
}

getCompetenceColor(competence: Competence): string {
  const colors = [
    'linear-gradient(145deg, #0f3b5e, #1b5a7e)',
    'linear-gradient(145deg, #10b981, #059669)',
    'linear-gradient(145deg, #f59e0b, #d97706)',
    'linear-gradient(145deg, #3b82f6, #2563eb)',
    'linear-gradient(145deg, #8b5cf6, #6d28d9)'
  ];
  return colors[competence.id % colors.length];
}

getCompetenceGradient(competence: Competence): string {
  return this.getCompetenceColor(competence);
}

getPersonnelAvatars(competence: Competence): string[] {
  // Simule des initiales pour les avatars
  const initials = ['AB', 'CD', 'EF', 'GH', 'IJ'];
  return initials.slice(0, Math.min(3, this.getCompetencePersonnelCount(competence)));
}

onGlobalFilterChange(value: string): void {
  this.globalFilterValue = value;
  this.applyFilter();
}

filterByStatus(status: 'all' | 'active' | 'inactive'): void {
  this.filterStatus = status;
  this.applyFilter();
}

applyFilter(): void {
  let filtered = [...this.competences];
  
  if (this.filterStatus === 'active') {
    filtered = filtered.filter(c => c.actif);
  } else if (this.filterStatus === 'inactive') {
    filtered = filtered.filter(c => !c.actif);
  }
  
  // Appliquer aussi la recherche globale si nécessaire
  if (this.globalFilterValue) {
    const searchTerm = this.globalFilterValue.toLowerCase();
    filtered = filtered.filter(c => 
      c.nom.toLowerCase().includes(searchTerm) || 
      (c.description && c.description.toLowerCase().includes(searchTerm))
    );
  }
  
  this.filteredCompetences = filtered;
}

// Modifiez loadCompetences pour mettre à jour filteredCompetences
loadCompetences(): void {
  this.loading = true;
  this.competenceService.getCompetences().subscribe(
    (data: Competence[]) => {
        const normalized = (data || []).map(item => ({
          ...item,
          domaine: item.domaine || 'Général',
          actif: item.actif ?? item.isActive ?? true
        }));
        this.competences = normalized;
        this.applyFilter();
        this.loading = false;
    },
    () => {
      this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Impossible de charger les competences' });
      this.loading = false;
    }
  );
}
}