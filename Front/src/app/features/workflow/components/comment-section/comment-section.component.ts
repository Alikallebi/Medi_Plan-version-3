import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkflowAttachmentRef, WorkflowComment } from '../../services/workflow.service';

export interface CommentSubmitEvent {
    message: string;
    selectedAttachmentIds: string[];
}

@Component({
    selector: 'app-comment-section',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './comment-section.component.html',
    styleUrls: ['./comment-section.component.scss']
})
export class CommentSectionComponent {
    @Input() comments: WorkflowComment[] = [];
    @Input() attachments: WorkflowAttachmentRef[] = [];
    @Input() isLoading = false;
    @Input() hasError = false;
    @Input() errorMessage = '';
    @Input() isSubmitting = false;

    @Output() retry = new EventEmitter<void>();
    @Output() submitComment = new EventEmitter<CommentSubmitEvent>();

    draft = '';
    selectedAttachmentIds: string[] = [];

    get isDraftValid(): boolean {
        return this.draft.trim().length > 0;
    }

    onToggleAttachment(attachmentId: string, checked: boolean): void {
        if (checked) {
            if (!this.selectedAttachmentIds.includes(attachmentId)) {
                this.selectedAttachmentIds = [...this.selectedAttachmentIds, attachmentId];
            }
            return;
        }

        this.selectedAttachmentIds = this.selectedAttachmentIds.filter(id => id !== attachmentId);
    }

    onSubmit(): void {
        if (!this.isDraftValid || this.isSubmitting) {
            return;
        }

        this.submitComment.emit({
            message: this.draft.trim(),
            selectedAttachmentIds: this.selectedAttachmentIds
        });
    }

    resetDraft(): void {
        this.draft = '';
        this.selectedAttachmentIds = [];
    }
}
