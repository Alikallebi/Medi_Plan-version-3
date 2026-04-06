import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GroupesRoutingModule } from './groupes-routing.module';
import { GroupesComponent } from './groupes.component';

@NgModule({
    imports: [
        CommonModule,
        GroupesRoutingModule
    ],
    declarations: [GroupesComponent]
})
export class GroupesModule { }
