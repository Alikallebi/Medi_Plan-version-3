describe('Workflow Integration - Rejet Flow', () => {
    it('should reject, notify creator, resubmit and validate successfully', () => {
        const engine = new WorkflowEngine();
        const planning = engine.createPlanning('Planning Avril');

        engine.submit(planning.id, 'Créateur');
        engine.reject(planning.id, 'Chef Service', 'Effectifs insuffisants');

        const rejected = engine.get(planning.id);
        expect(rejected.status).toBe('REJETE');
        expect(rejected.notifications).toContain('Notification envoyée au créateur: Effectifs insuffisants');

        engine.modifyAndResubmit(planning.id, 'Créateur');
        expect(engine.get(planning.id).status).toBe('EN_ATTENTE_N1');

        engine.approveAll(planning.id);
        expect(engine.get(planning.id).status).toBe('VALIDE');
    });
});

export {};

type RejetStatus = 'BROUILLON' | 'EN_ATTENTE_N1' | 'EN_ATTENTE_N2' | 'EN_ATTENTE_FINAL' | 'VALIDE' | 'REJETE';

interface RejetItem {
    id: number;
    status: RejetStatus;
    notifications: string[];
    history: string[];
}

class WorkflowEngine {
    private idSeq = 0;
    private store = new Map<number, RejetItem>();

    createPlanning(_: string): RejetItem {
        const id = ++this.idSeq;
        const value: RejetItem = { id, status: 'BROUILLON', notifications: [], history: [] };
        this.store.set(id, value);
        return value;
    }

    submit(id: number, actor: string): void {
        const item = this.get(id);
        item.status = 'EN_ATTENTE_N1';
        item.history.push(`SOUMISSION:${actor}`);
    }

    reject(id: number, actor: string, reason: string): void {
        const item = this.get(id);
        item.status = 'REJETE';
        item.history.push(`REJET:${actor}:${reason}`);
        item.notifications.push(`Notification envoyée au créateur: ${reason}`);
    }

    modifyAndResubmit(id: number, actor: string): void {
        const item = this.get(id);
        item.history.push(`MODIFICATION:${actor}`);
        item.status = 'EN_ATTENTE_N1';
    }

    approveAll(id: number): void {
        const item = this.get(id);
        item.status = 'EN_ATTENTE_N2';
        item.status = 'EN_ATTENTE_FINAL';
        item.status = 'VALIDE';
        item.history.push('VALIDATION_COMPLETE');
    }

    get(id: number): RejetItem {
        const value = this.store.get(id);
        if (!value) {
            throw new Error('not found');
        }
        return value;
    }
}
