import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export type WorkflowRole = 'CHEF_EQUIPE' | 'RESPONSABLE' | 'ADMIN';

export interface WorkflowConfig {
  id: number;
  nomWorkflow: string;
  niveauValidation: number;
  roleValidator: WorkflowRole;
  delaiHeures: number;
  actif: boolean;
}

@Injectable({ providedIn: 'root' })
export class WorkflowConfigService {
  private workflows: WorkflowConfig[] = [
    { id: 1, nomWorkflow: 'Validation planning semaine', niveauValidation: 1, roleValidator: 'CHEF_EQUIPE', delaiHeures: 24, actif: true },
    { id: 2, nomWorkflow: 'Validation planning mois', niveauValidation: 2, roleValidator: 'RESPONSABLE', delaiHeures: 48, actif: true },
    { id: 3, nomWorkflow: 'Validation exceptionnelle', niveauValidation: 3, roleValidator: 'ADMIN', delaiHeures: 72, actif: false }
  ];

  getWorkflows(): Observable<WorkflowConfig[]> {
    return of([...this.workflows]);
  }

  createWorkflow(payload: Omit<WorkflowConfig, 'id'>): Observable<WorkflowConfig> {
    const newId = Math.max(0, ...this.workflows.map(w => w.id)) + 1;
    const newWorkflow: WorkflowConfig = { id: newId, ...payload };
    this.workflows = [...this.workflows, newWorkflow];
    return of(newWorkflow);
  }

  updateWorkflow(id: number, payload: Omit<WorkflowConfig, 'id'>): Observable<WorkflowConfig> {
    const updated: WorkflowConfig = { id, ...payload };
    this.workflows = this.workflows.map(w => (w.id === id ? updated : w));
    return of(updated);
  }

  deleteWorkflow(id: number): Observable<void> {
    this.workflows = this.workflows.filter(w => w.id !== id);
    return of(void 0);
  }
}
