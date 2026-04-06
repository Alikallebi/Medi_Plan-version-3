import { CommonModule } from '@angular/common';
import { Component, Injectable, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';

interface ExportResponse {
  fileName: string;
  content: string;
  mimeType: string;
  isBase64: boolean;
}

/**
 * Service pour gérer les exports de planning (HTML, PDF, CSV, Excel)
 */
@Injectable({
  providedIn: 'root'
})
export class PlanningExportService {
  private readonly API_URL = '/api/planning/export';

  constructor(private http: HttpClient) {}

  /**
   * Exporte un planning dans le format spécifié
   */
  export(
    serviceId: string,
    serviceName: string,
    weekStart: string,
    format: 'html' | 'pdf' | 'csv' | 'excel',
    weekEnd?: string
  ): Observable<ExportResponse> {
    let params = new HttpParams()
      .set('serviceId', serviceId)
      .set('serviceName', serviceName)
      .set('weekStart', weekStart)
      .set('format', format);

    if (weekEnd) {
      params = params.set('weekEnd', weekEnd);
    }

    return this.http.get<ExportResponse>(this.API_URL, { params });
  }

  /**
   * Télécharge le fichier exporté
   */
  download(
    serviceId: string,
    serviceName: string,
    weekStart: string,
    format: 'html' | 'pdf' | 'csv' | 'excel',
    weekEnd?: string
  ): void {
    this.export(serviceId, serviceName, weekStart, format, weekEnd).subscribe({
      next: (response) => {
        let blob: Blob;

        if (response.isBase64) {
          // Pour PDF (base64)
          const byteCharacters = atob(response.content);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          blob = new Blob([byteArray], { type: response.mimeType });
        } else {
          // Pour HTML, CSV, Excel (texte)
          blob = new Blob([response.content], { type: response.mimeType });
        }

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Export failed:', err);
        alert('Erreur lors de l\'export du planning');
      }
    });
  }

  /**
   * Prévisualise le planning HTML dans une nouvelle fenêtre
   */
  previewHtml(
    serviceId: string,
    serviceName: string,
    weekStart: string,
    weekEnd?: string
  ): void {
    this.export(serviceId, serviceName, weekStart, 'html', weekEnd).subscribe({
      next: (response) => {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(response.content);
          newWindow.document.close();
        } else {
          alert('Veuillez autoriser les pop-ups pour prévisualiser');
        }
      },
      error: (err) => {
        console.error('Preview failed:', err);
        alert('Erreur lors de la prévisualisation');
      }
    });
  }

  /**
   * Imprime directement le planning HTML
   */
  printHtml(
    serviceId: string,
    serviceName: string,
    weekStart: string,
    weekEnd?: string
  ): void {
    this.export(serviceId, serviceName, weekStart, 'html', weekEnd).subscribe({
      next: (response) => {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(response.content);
          printWindow.document.close();
          
          // Attendre le chargement complet avant d'imprimer
          printWindow.onload = () => {
            printWindow.print();
          };
        } else {
          alert('Veuillez autoriser les pop-ups pour imprimer');
        }
      },
      error: (err) => {
        console.error('Print failed:', err);
        alert('Erreur lors de l\'impression');
      }
    });
  }
}

/**
 * Composant pour gérer les exports de planning
 */
@Component({
  selector: 'app-planning-export',
  standalone: true,
  imports: [CommonModule, ButtonModule, ToastModule],
  providers: [MessageService],
  template: `
    <div class="export-panel">
      <h3 class="export-title">
        <i class="pi pi-download"></i>
        Exporter le Planning
      </h3>

      <div class="export-info">
        <p><strong>Service:</strong> {{ serviceName }}</p>
        <p><strong>Période:</strong> {{ weekStart | date:'dd/MM/yyyy' }} 
           <span *ngIf="weekEnd"> → {{ weekEnd | date:'dd/MM/yyyy' }}</span>
        </p>
      </div>

      <div class="export-actions">
        <!-- Export HTML Moderne -->
        <div class="export-option highlight">
          <h4>
            <i class="pi pi-file-code"></i>
            Export HTML Moderne
          </h4>
          <p class="description">
            Design médical professionnel avec statistiques et légende
          </p>
          <div class="button-group">
            <button 
              pButton 
              type="button" 
              label="Prévisualiser" 
              icon="pi pi-eye"
              class="p-button-info"
              (click)="onPreviewHtml()"
              [loading]="loading">
            </button>
            <button 
              pButton 
              type="button" 
              label="Télécharger" 
              icon="pi pi-download"
              class="p-button-primary"
              (click)="onDownloadHtml()"
              [loading]="loading">
            </button>
            <button 
              pButton 
              type="button" 
              label="Imprimer" 
              icon="pi pi-print"
              class="p-button-success"
              (click)="onPrintHtml()"
              [loading]="loading">
            </button>
          </div>
        </div>

        <!-- Export PDF (ancien) -->
        <div class="export-option">
          <h4>
            <i class="pi pi-file-pdf"></i>
            Export PDF
          </h4>
          <p class="description">Format PDF compatible avec tous les systèmes</p>
          <button 
            pButton 
            type="button" 
            label="Télécharger PDF" 
            icon="pi pi-file-pdf"
            class="p-button-danger"
            (click)="onDownloadPdf()"
            [loading]="loading">
          </button>
        </div>

        <!-- Export Excel -->
        <div class="export-option">
          <h4>
            <i class="pi pi-file-excel"></i>
            Export Excel
          </h4>
          <p class="description">Tableur Excel pour analyse et modifications</p>
          <button 
            pButton 
            type="button" 
            label="Télécharger Excel" 
            icon="pi pi-file-excel"
            class="p-button-success"
            (click)="onDownloadExcel()"
            [loading]="loading">
          </button>
        </div>

        <!-- Export CSV -->
        <div class="export-option">
          <h4>
            <i class="pi pi-file"></i>
            Export CSV
          </h4>
          <p class="description">Format CSV simple pour import/export</p>
          <button 
            pButton 
            type="button" 
            label="Télécharger CSV" 
            icon="pi pi-file"
            (click)="onDownloadCsv()"
            [loading]="loading">
          </button>
        </div>
      </div>

      <p-toast position="top-right"></p-toast>
    </div>
  `,
  styles: [`
    .export-panel {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .export-title {
      font-size: 20px;
      font-weight: 600;
      color: #0066A0;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .export-info {
      background: #F5F7FA;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      border-left: 4px solid #0066A0;
    }

    .export-info p {
      margin: 4px 0;
      color: #34495E;
    }

    .export-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }

    .export-option {
      background: #F8F9FA;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #E0E0E0;
      transition: all 0.3s;
    }

    .export-option:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .export-option.highlight {
      border: 2px solid #0066A0;
      background: linear-gradient(135deg, #F5F7FA 0%, #FFFFFF 100%);
    }

    .export-option h4 {
      font-size: 16px;
      color: #2C3E50;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .export-option .description {
      font-size: 13px;
      color: #7F8C8D;
      margin-bottom: 16px;
    }

    .button-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .button-group button {
      width: 100%;
    }

    @media (max-width: 768px) {
      .export-actions {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class PlanningExportComponent implements OnInit {
  serviceId: string = '';
  serviceName: string = '';
  weekStart: Date = new Date();
  weekEnd?: Date;
  loading: boolean = false;

  constructor(
    private exportService: PlanningExportService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    // Récupérer les données depuis le composant parent ou la route
    // this.serviceId = this.route.snapshot.params['serviceId'];
    // this.serviceName = ...;
    // this.weekStart = ...;
  }

  onPreviewHtml(): void {
    if (!this.validateServiceSelection()) {
      return;
    }
    this.loading = true;
    this.exportService.previewHtml(
      this.serviceId,
      this.serviceName,
      this.formatDate(this.weekStart),
      this.weekEnd ? this.formatDate(this.weekEnd) : undefined
    );
    
    setTimeout(() => {
      this.loading = false;
      this.showSuccess('Prévisualisation ouverte dans une nouvelle fenêtre');
    }, 1000);
  }

  onDownloadHtml(): void {
    if (!this.validateServiceSelection()) {
      return;
    }
    this.loading = true;
    this.exportService.download(
      this.serviceId,
      this.serviceName,
      this.formatDate(this.weekStart),
      'html',
      this.weekEnd ? this.formatDate(this.weekEnd) : undefined
    );
    
    setTimeout(() => {
      this.loading = false;
      this.showSuccess('Export HTML téléchargé avec succès');
    }, 1500);
  }

  onPrintHtml(): void {
    if (!this.validateServiceSelection()) {
      return;
    }
    this.loading = true;
    this.exportService.printHtml(
      this.serviceId,
      this.serviceName,
      this.formatDate(this.weekStart),
      this.weekEnd ? this.formatDate(this.weekEnd) : undefined
    );
    
    setTimeout(() => {
      this.loading = false;
      this.showSuccess('Impression en cours...');
    }, 1000);
  }

  onDownloadPdf(): void {
    if (!this.validateServiceSelection()) {
      return;
    }
    this.loading = true;
    this.exportService.download(
      this.serviceId,
      this.serviceName,
      this.formatDate(this.weekStart),
      'pdf',
      this.weekEnd ? this.formatDate(this.weekEnd) : undefined
    );
    
    setTimeout(() => {
      this.loading = false;
      this.showSuccess('Export PDF téléchargé avec succès');
    }, 1500);
  }

  onDownloadExcel(): void {
    if (!this.validateServiceSelection()) {
      return;
    }
    this.loading = true;
    this.exportService.download(
      this.serviceId,
      this.serviceName,
      this.formatDate(this.weekStart),
      'excel',
      this.weekEnd ? this.formatDate(this.weekEnd) : undefined
    );
    
    setTimeout(() => {
      this.loading = false;
      this.showSuccess('Export Excel téléchargé avec succès');
    }, 1500);
  }

  onDownloadCsv(): void {
    if (!this.validateServiceSelection()) {
      return;
    }
    this.loading = true;
    this.exportService.download(
      this.serviceId,
      this.serviceName,
      this.formatDate(this.weekStart),
      'csv',
      this.weekEnd ? this.formatDate(this.weekEnd) : undefined
    );
    
    setTimeout(() => {
      this.loading = false;
      this.showSuccess('Export CSV téléchargé avec succès');
    }, 1500);
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private showSuccess(message: string): void {
    this.messageService.add({
      severity: 'success',
      summary: 'Succès',
      detail: message,
      life: 3000
    });
  }

  private validateServiceSelection(): boolean {
    if (this.serviceId && this.serviceName) {
      return true;
    }

    this.messageService.add({
      severity: 'warn',
      summary: 'Service requis',
      detail: 'Veuillez sélectionner un service avant d\'exporter le planning.',
      life: 3500
    });

    return false;
  }
}
