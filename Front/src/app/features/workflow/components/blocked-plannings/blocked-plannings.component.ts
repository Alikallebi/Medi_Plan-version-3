import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BlockedPlanning } from '../../models';

@Component({
    selector: 'app-blocked-plannings',
    templateUrl: './blocked-plannings.component.html',
    styleUrls: ['./blocked-plannings.component.scss']
})
export class BlockedPlanningsComponent {
    @Input() plannings: BlockedPlanning[] = [];

    @Output() relancer = new EventEmitter<BlockedPlanning>();
    @Output() reaffecter = new EventEmitter<BlockedPlanning>();
    @Output() validerDOffice = new EventEmitter<BlockedPlanning>();
}
