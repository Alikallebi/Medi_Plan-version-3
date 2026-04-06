describe('Workflow Integration - Versioning Flow', () => {
    it('should create new version after post-validation change and keep version history', () => {
        const engine = new VersionEngine();
        const planning = engine.create('Planning Mai');

        engine.validate(planning.id);
        expect(engine.get(planning.id).status).toBe('VALIDE');

        engine.applyShiftSwap(planning.id, 'Echange garde 12/13');

        const updated = engine.get(planning.id);
        expect(updated.currentVersion).toBe(2);
        expect(updated.status).toBe('EN_ATTENTE_FINAL');
        expect(updated.versions.length).toBe(2);

        engine.revalidateMinorChange(planning.id, 'Super Admin');

        const finalState = engine.get(planning.id);
        expect(finalState.status).toBe('VALIDE');
        expect(finalState.versions.map(v => v.version)).toEqual([1, 2]);
    });
});

export {};

type VersionStatus = 'EN_ATTENTE_FINAL' | 'VALIDE';

interface VersionEntry {
    version: number;
    reason: string;
}

interface VersionedPlanning {
    id: number;
    status: VersionStatus;
    currentVersion: number;
    versions: VersionEntry[];
}

class VersionEngine {
    private sequence = 0;
    private data = new Map<number, VersionedPlanning>();

    create(_: string): VersionedPlanning {
        const id = ++this.sequence;
        const item: VersionedPlanning = {
            id,
            status: 'EN_ATTENTE_FINAL',
            currentVersion: 1,
            versions: [{ version: 1, reason: 'Initiale' }]
        };
        this.data.set(id, item);
        return item;
    }

    validate(id: number): void {
        this.get(id).status = 'VALIDE';
    }

    applyShiftSwap(id: number, reason: string): void {
        const item = this.get(id);
        item.currentVersion += 1;
        item.versions.push({ version: item.currentVersion, reason });
        item.status = 'EN_ATTENTE_FINAL';
    }

    revalidateMinorChange(id: number, _: string): void {
        this.get(id).status = 'VALIDE';
    }

    get(id: number): VersionedPlanning {
        const item = this.data.get(id);
        if (!item) {
            throw new Error('not found');
        }
        return item;
    }
}
