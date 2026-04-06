import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Conflict, PlanningStats, Rule } from 'src/app/demo/api/planning.models';

@Component({
    selector: 'app-rules-panel',
    templateUrl: './rules-panel.component.html',
    styleUrls: ['./rules-panel.component.scss']
})
export class RulesPanelComponent {
    @Input() rules: Rule[] = [];
    @Input() conflicts: Conflict[] = [];
    @Input() stats: PlanningStats = { occupancyRate: 0, coveredPosts: 0, totalPosts: 0, conflicts: 0 };

    @Output() resolveConflict = new EventEmitter<string>();
    @Output() collapsedChange = new EventEmitter<boolean>();

    isCollapsed = false;

    toggle(): void {
        this.isCollapsed = !this.isCollapsed;
        this.collapsedChange.emit(this.isCollapsed);
    }

    getRuleState(rule: Rule): 'ok' | 'ko' {
        if (!rule.active) {
            return 'ok';
        }

        if (rule.type === 'repos') {
            return this.conflicts.some(item => item.type === 'repos_insuffisant') ? 'ko' : 'ok';
        }

        if (rule.type === 'quota') {
            return this.conflicts.some(item => item.type === 'quota_depasse') ? 'ko' : 'ok';
        }

        return 'ok';
    }
}
