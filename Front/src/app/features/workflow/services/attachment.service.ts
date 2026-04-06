import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { WorkflowAttachmentRef } from './workflow.service';

export interface WorkflowAttachment extends WorkflowAttachmentRef {
    downloadUrl?: string;
    dataUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class AttachmentService {
    private readonly apiUrl = `${environment.apiBaseUrl}/api/workflow`;

    constructor(private readonly http: HttpClient) {}

    getAttachments(planningId: number): Observable<WorkflowAttachment[]> {
        return this.http
            .get<WorkflowAttachment[]>(`${this.apiUrl}/plannings/${planningId}/attachments`)
            .pipe(
                tap(items => this.writeLocalAttachments(planningId, items || [])),
                catchError(() => of(this.readLocalAttachments(planningId)))
            );
    }

    uploadAttachment(planningId: number, file: File): Observable<WorkflowAttachment> {
        const formData = new FormData();
        formData.append('file', file);

        return this.http
            .post<WorkflowAttachment>(`${this.apiUrl}/plannings/${planningId}/attachments`, formData)
            .pipe(
                tap((uploaded) => {
                    const current = this.readLocalAttachments(planningId);
                    this.writeLocalAttachments(planningId, [uploaded, ...current.filter(item => item.id !== uploaded.id)]);
                }),
                catchError(() => {
                    return this.readFileAsDataUrl(file).pipe(
                        map((dataUrl) => {
                            const localAttachment: WorkflowAttachment = {
                                id: `local-file-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                                fileName: file.name,
                                fileType: file.type || 'application/octet-stream',
                                size: file.size,
                                uploadedAt: new Date().toISOString(),
                                uploadedBy: localStorage.getItem('nom') || 'Utilisateur',
                                dataUrl
                            };

                            const current = this.readLocalAttachments(planningId);
                            this.writeLocalAttachments(planningId, [localAttachment, ...current]);
                            return localAttachment;
                        })
                    );
                })
            );
    }

    deleteAttachment(planningId: number, attachmentId: string): Observable<void> {
        return this.http
            .delete<void>(`${this.apiUrl}/plannings/${planningId}/attachments/${attachmentId}`)
            .pipe(
                tap(() => this.removeFromLocal(planningId, attachmentId)),
                catchError(() => {
                    this.removeFromLocal(planningId, attachmentId);
                    return of(void 0);
                })
            );
    }

    private getStorageKey(planningId: number): string {
        return `workflow-attachments-${planningId}`;
    }

    private readLocalAttachments(planningId: number): WorkflowAttachment[] {
        const raw = localStorage.getItem(this.getStorageKey(planningId));
        if (!raw) {
            return [];
        }

        try {
            const parsed = JSON.parse(raw) as WorkflowAttachment[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private writeLocalAttachments(planningId: number, attachments: WorkflowAttachment[]): void {
        localStorage.setItem(this.getStorageKey(planningId), JSON.stringify(attachments));
    }

    private removeFromLocal(planningId: number, attachmentId: string): void {
        const current = this.readLocalAttachments(planningId);
        const updated = current.filter(item => item.id !== attachmentId);
        this.writeLocalAttachments(planningId, updated);
    }

    private readFileAsDataUrl(file: File): Observable<string> {
        return new Observable<string>((observer) => {
            const reader = new FileReader();
            reader.onload = () => {
                observer.next(`${reader.result || ''}`);
                observer.complete();
            };
            reader.onerror = () => {
                observer.error(new Error('Lecture fichier impossible'));
            };
            reader.readAsDataURL(file);
        });
    }
}
