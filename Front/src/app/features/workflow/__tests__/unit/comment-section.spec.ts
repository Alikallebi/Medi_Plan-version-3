import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommentSectionComponent } from '../../components/comment-section/comment-section.component';

describe('CommentSectionComponent', () => {
    let component: CommentSectionComponent;
    let fixture: ComponentFixture<CommentSectionComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CommentSectionComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(CommentSectionComponent);
        component = fixture.componentInstance;
    });

    it('should display list of comments', () => {
        component.comments = [
            {
                id: '1',
                planningId: '101',
                auteurNom: 'Alice',
                auteurRole: 'CHEF_SERVICE',
                message: 'Commentaire 1',
                createdAt: new Date().toISOString()
            },
            {
                id: '2',
                planningId: '101',
                auteurNom: 'Bob',
                auteurRole: 'RH',
                message: 'Commentaire 2',
                createdAt: new Date().toISOString()
            }
        ];

        fixture.detectChanges();

        const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.comment-item');
        expect(items.length).toBe(2);
    });

    it('should show "no comments" message when empty', () => {
        component.comments = [];
        fixture.detectChanges();

        const empty = (fixture.nativeElement as HTMLElement).querySelector('.empty')?.textContent || '';
        expect(empty).toContain('Aucun commentaire');
    });

    it('should add new comment when form submitted', () => {
        component.draft = 'Nouveau commentaire';
        const emitSpy = spyOn(component.submitComment, 'emit');

        component.onSubmit();

        expect(emitSpy).toHaveBeenCalledWith({
            message: 'Nouveau commentaire',
            selectedAttachmentIds: []
        });
    });

    it('should not submit empty comment', () => {
        component.draft = '   ';
        const emitSpy = spyOn(component.submitComment, 'emit');

        component.onSubmit();

        expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should show loading state during submission', () => {
        component.isSubmitting = true;
        component.draft = 'Commentaire';
        fixture.detectChanges();

        const button = (fixture.nativeElement as HTMLElement).querySelector('.composer .btn.primary') as HTMLButtonElement;
        expect(button.disabled).toBeTrue();
        expect(button.textContent).toContain('Envoi...');
    });

    it('should display error if comment submission fails', () => {
        component.hasError = true;
        component.errorMessage = 'Erreur d\'envoi';
        fixture.detectChanges();

        const error = (fixture.nativeElement as HTMLElement).querySelector('.state.error p')?.textContent || '';
        expect(error).toContain('Erreur d\'envoi');
    });
});
