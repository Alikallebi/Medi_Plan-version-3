import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { MedicalService } from 'src/app/demo/service/current-service.service';

interface ServiceColors {
    bg: string;
    accent: string;
    text: string;
}

const SERVICE_COLORS: Record<string, ServiceColors> = {
    cardiologie:  { bg: '#fff1f2', accent: '#f43f5e', text: '#9f1239' },
    urgences:     { bg: '#fff7ed', accent: '#f97316', text: '#9a3412' },
    chirurgie:    { bg: '#ecfdf5', accent: '#10b981', text: '#065f46' },
    pediatrie:    { bg: '#eff6ff', accent: '#3b82f6', text: '#1e40af' },
    reanimation:  { bg: '#f5f3ff', accent: '#8b5cf6', text: '#4c1d95' },
    neurologie:   { bg: '#eef2ff', accent: '#6366f1', text: '#3730a3' },
    oncologie:    { bg: '#fdf4ff', accent: '#a855f7', text: '#6b21a8' },
    radiologie:   { bg: '#f8fafc', accent: '#64748b', text: '#1e293b' },
    gynecologie:  { bg: '#fdf2f8', accent: '#ec4899', text: '#9d174d' },
    laboratoire:  { bg: '#fffbeb', accent: '#f59e0b', text: '#92400e' },
    nephrologie:  { bg: '#f0fdf4', accent: '#22c55e', text: '#14532d' },
    pneumologie:  { bg: '#f0f9ff', accent: '#0ea5e9', text: '#0c4a6e' },
    all:          { bg: '#f1f5f9', accent: '#475569', text: '#0f172a' },
};

const DEFAULT_COLORS: ServiceColors = { bg: '#f1f5f9', accent: '#475569', text: '#1e293b' };

@Component({
    selector: 'app-service-picker',
    templateUrl: './service-picker.component.html',
    styleUrls: ['./service-picker.component.scss']
})
export class ServicePickerComponent {
    @Input() services: MedicalService[] = [];
    @Input() currentServiceId = '';
    @Output() serviceChanged = new EventEmitter<string>();

    isOpen = false;
    searchQuery = '';
    showFavoritesOnly = false;

    constructor(private readonly el: ElementRef) {}

    get currentService(): MedicalService | undefined {
        return this.services.find(s => s.id === this.currentServiceId);
    }

    get filteredServices(): MedicalService[] {
        const q = this.searchQuery.toLowerCase().trim();
        return this.services.filter(s => {
            const matchSearch = !q || s.name.toLowerCase().includes(q);
            const matchFav = !this.showFavoritesOnly || s.isFavorite;
            return matchSearch && matchFav;
        });
    }

    toggle(): void {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.searchQuery = '';
        }
    }

    selectService(id: string): void {
        this.serviceChanged.emit(id);
        this.isOpen = false;
    }

    getColors(id: string): ServiceColors {
        return SERVICE_COLORS[id] ?? DEFAULT_COLORS;
    }

    getCardBg(id: string): string {
        return this.getColors(id).bg;
    }

    getCardAccent(id: string): string {
        return this.getColors(id).accent;
    }

    getCardText(id: string): string {
        return this.getColors(id).text;
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.el.nativeElement.contains(event.target as Node)) {
            this.isOpen = false;
        }
    }
}
