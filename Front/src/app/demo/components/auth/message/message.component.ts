import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-message',
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.css']
})
export class MessageComponent implements OnInit {

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Vous pouvez ajouter des initialisations ici si nécessaire
  }

  redirectToLogin(): void {
    // Rediriger vers le composant Login
    this.router.navigate(['/auth/login']);
  }
}
