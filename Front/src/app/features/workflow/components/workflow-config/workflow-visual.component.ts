import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-workflow-visual',
  templateUrl: './workflow-visual.component.html',
  styleUrls: ['./workflow-visual.component.scss']
})
export class WorkflowVisualComponent {
  @Input() validatorName: string = 'Maxime Durand';
  @Input() validatorPhotoUrl: string = 'assets/images/validator-photo.jpg';
}
