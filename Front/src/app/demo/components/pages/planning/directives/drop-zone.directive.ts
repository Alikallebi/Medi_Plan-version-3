import { Directive, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { DragPlanningItem, DropTargetCell } from 'src/app/demo/api/planning.models';
import { DragDropService } from 'src/app/demo/service/drag-drop.service';

@Directive({
    selector: '[appDropZone]'
})
export class DropZoneDirective {
    @Input() dropData!: DropTargetCell;
    @Input() dropValidator: ((drag: DragPlanningItem, target: DropTargetCell) => boolean) | null = null;

    @Output() dropped = new EventEmitter<{ dragData: DragPlanningItem; targetData: DropTargetCell }>();

    constructor(
        private readonly dragDropService: DragDropService,
        private readonly elementRef: ElementRef<HTMLElement>
    ) {}

    @HostListener('dragenter', ['$event'])
    onDragEnter(event: DragEvent): void {
        event.preventDefault();
        this.applyDropState();
    }

    @HostListener('dragover', ['$event'])
    onDragOver(event: DragEvent): void {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        this.applyDropState();
    }

    @HostListener('dragleave')
    onDragLeave(): void {
        this.elementRef.nativeElement.classList.remove('drop-valid', 'drop-invalid');
        this.elementRef.nativeElement.removeAttribute('data-drop-hint');
    }

    @HostListener('drop', ['$event'])
    onDrop(event: DragEvent): void {
        event.preventDefault();

        const dragItem = this.dragDropService.currentDragItem;
        this.elementRef.nativeElement.classList.remove('drop-valid', 'drop-invalid');
        this.elementRef.nativeElement.removeAttribute('data-drop-hint');

        if (!dragItem) {
            return;
        }

        const valid = this.dropValidator ? this.dropValidator(dragItem, this.dropData) : true;
        if (!valid) {
            return;
        }

        this.dropped.emit({
            dragData: dragItem,
            targetData: this.dropData
        });
    }

    private applyDropState(): void {
        const dragItem = this.dragDropService.currentDragItem;
        if (!dragItem) {
            return;
        }

        const valid = this.dropValidator ? this.dropValidator(dragItem, this.dropData) : true;
        this.elementRef.nativeElement.classList.toggle('drop-valid', valid);
        this.elementRef.nativeElement.classList.toggle('drop-invalid', !valid);
        if (valid) {
            this.elementRef.nativeElement.removeAttribute('data-drop-hint');
        } else {
            this.elementRef.nativeElement.setAttribute('data-drop-hint', 'Affectation incompatible');
        }
    }
}
