describe('Workflow Integration - Validation Flow', () => {
    it('should complete full validation chain and end with VALIDE status', () => {
        const engine = new WorkflowEngine();

        const planning = engine.createPlanning('Planning Mars 2026');
        expect(planning.status).toBe('BROUILLON');

        engine.submit(planning.id, 'Créateur');
        expect(engine.get(planning.id).status).toBe('EN_ATTENTE_N1');

        engine.approveStep(planning.id, 'Chef Service');
        expect(engine.get(planning.id).status).toBe('EN_ATTENTE_N2');

        engine.approveStep(planning.id, 'Validateur RH');
        expect(engine.get(planning.id).status).toBe('EN_ATTENTE_FINAL');

        engine.approveStep(planning.id, 'Super Admin');
        const finalState = engine.get(planning.id);

        expect(finalState.status).toBe('VALIDE');
        expect(finalState.history[finalState.history.length - 1]?.action).toBe('VALIDATION_FINALE');
    });
});

    export {};

type FlowStatus = 'BROUILLON' | 'EN_ATTENTE_N1' | 'EN_ATTENTE_N2' | 'EN_ATTENTE_FINAL' | 'VALIDE' | 'REJETE';

interface FlowItem {
    id: number;
    label: string;
    status: FlowStatus;
    version: number;
    history: Array<{ action: string; actor: string; reason?: string }>;
}

class WorkflowEngine {
    private currentId = 0;
    private items = new Map<number, FlowItem>();

    createPlanning(label: string): FlowItem {
        const id = ++this.currentId;
        const item: FlowItem = { id, label, status: 'BROUILLON', version: 1, history: [] };
        this.items.set(id, item);
        return item;
    }

    submit(id: number, actor: string): void {
        this.patch(id, 'EN_ATTENTE_N1', { action: 'SOUMISSION', actor });
    }

    approveStep(id: number, actor: string): void {
        const item = this.get(id);
        if (item.status === 'EN_ATTENTE_N1') {
            this.patch(id, 'EN_ATTENTE_N2', { action: 'APPROBATION_N1', actor });
            return;
        }
        if (item.status === 'EN_ATTENTE_N2') {
            this.patch(id, 'EN_ATTENTE_FINAL', { action: 'APPROBATION_N2', actor });
            return;
        }
        if (item.status === 'EN_ATTENTE_FINAL') {
            this.patch(id, 'VALIDE', { action: 'VALIDATION_FINALE', actor });
        }
    }

    get(id: number): FlowItem {
        const item = this.items.get(id);
        if (!item) {
            throw new Error('missing');
        }
        return item;
    }

    private patch(id: number, status: FlowStatus, event: { action: string; actor: string; reason?: string }): void {
        const item = this.get(id);
        item.status = status;
        item.history.push(event);
    }
}
