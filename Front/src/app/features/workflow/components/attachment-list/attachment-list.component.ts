import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { WorkflowAttachment } from '../../services/attachment.service';

@Component({
    selector: 'app-attachment-list',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './attachment-list.component.html',
    styleUrls: ['./attachment-list.component.scss']
})
export class AttachmentListComponent {
    @Input() attachments: WorkflowAttachment[] = [];
    @Input() isLoading = false;
    @Input() hasError = false;
    @Input() errorMessage = '';
    @Input() isUploading = false;

    @Output() retry = new EventEmitter<void>();
    @Output() uploadFiles = new EventEmitter<File[]>();
    @Output() removeAttachment = new EventEmitter<string>();

    onFileChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) {
            return;
        }

        this.uploadFiles.emit(Array.from(input.files));
        input.value = '';
    }

    onPreview(item: WorkflowAttachment): void {
        const url = item.downloadUrl || item.dataUrl;
        if (!url) {
            return;
        }

        window.open(url, '_blank', 'noopener');
    }
}
