import { Directive, ElementRef, HostBinding, HostListener, Input } from '@angular/core';
import { DragPlanningItem } from 'src/app/demo/api/planning.models';
import { DragDropService } from 'src/app/demo/service/drag-drop.service';

@Directive({
    selector: '[appDragDrop]'
})
export class DragDropDirective {
    @Input() dragData!: DragPlanningItem;
    @Input() dragDisabled = false;
    private dragGhostEl: HTMLElement | null = null;

    @HostBinding('attr.draggable')
    get draggableAttr(): boolean {
        return !this.dragDisabled;
    }

    constructor(
        private readonly dragDropService: DragDropService,
        private readonly elementRef: ElementRef<HTMLElement>
    ) {}

    @HostListener('dragstart', ['$event'])
    onDragStart(event: DragEvent): void {
        if (this.dragDisabled || !this.dragData) {
            event.preventDefault();
            return;
        }

        event.dataTransfer?.setData('text/plain', JSON.stringify(this.dragData));
        event.dataTransfer!.effectAllowed = 'move';

        this.createDragGhost(event);
        this.dragDropService.startDrag(this.dragData);
        this.elementRef.nativeElement.classList.add('is-dragging');
        document.body.classList.add('planning-dragging');
    }

    @HostListener('dragend')
    onDragEnd(): void {
        this.dragDropService.clearDrag();
        this.elementRef.nativeElement.classList.remove('is-dragging');
        document.body.classList.remove('planning-dragging');
        this.destroyDragGhost();
    }

    private createDragGhost(event: DragEvent): void {
        if (!event.dataTransfer) {
            return;
        }

        const source = this.elementRef.nativeElement;
        const ghost = source.cloneNode(true) as HTMLElement;
        ghost.style.position = 'fixed';
        ghost.style.top = '-10000px';
        ghost.style.left = '-10000px';
        ghost.style.width = `${source.offsetWidth}px`;
        ghost.style.opacity = '0.78';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        ghost.style.transform = 'scale(0.96)';
        ghost.classList.add('drag-ghost-preview');
        document.body.appendChild(ghost);

        event.dataTransfer.setDragImage(ghost, 18, 18);
        this.dragGhostEl = ghost;
    }

    private destroyDragGhost(): void {
        if (!this.dragGhostEl) {
            return;
        }

        this.dragGhostEl.remove();
        this.dragGhostEl = null;
    }
}
