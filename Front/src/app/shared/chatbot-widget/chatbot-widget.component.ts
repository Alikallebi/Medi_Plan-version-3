import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChatbotService, ChatbotResponse } from '../../demo/service/chatbot.service';

interface WidgetMessage {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

@Component({
  selector: 'app-chatbot-widget',
  template: `
<button type="button" class="chatbot-toggle" (click)="toggle()" aria-label="Ouvrir ou fermer l'assistant">
  <span class="chatbot-icon" aria-hidden="true">💬</span>
</button>

<section class="chatbot-panel" *ngIf="isOpen" aria-label="Assistant MediPlan">
  <header class="chatbot-header">
    <div class="title-wrap">
      <div class="brand-line">
        <span class="status-dot" aria-hidden="true"></span>
        <h3 class="brand-label">Assistant MediPlan</h3>
      </div>
      <small>Questions planning, accès, demandes et workflow selon votre profil.</small>
    </div>

    <div class="header-actions">
      <button type="button" class="link-btn" (click)="clearConversation()">Réinitialiser</button>
      <button type="button" class="link-btn" (click)="toggle()" aria-label="Fermer l'assistant">Fermer</button>
    </div>
  </header>

  <div class="chatbot-meta">
    <span class="meta-chip">{{ roleLabel }}</span>
    <span class="meta-chip meta-chip-soft">{{ roleHint }}</span>
  </div>

  <div class="chatbot-body" #chatBody>
    <div class="chatbot-hint">
      Je peux vous aider à retrouver un planning, suivre une demande, consulter vos droits ou comprendre une validation workflow.
    </div>

    <div class="empty-state" *ngIf="messages.length === 0">
      <div class="empty-title">Aucune conversation</div>
      <div class="empty-copy">Posez une question ou utilisez une suggestion rapide ci-dessous.</div>
    </div>

    <div class="message" *ngFor="let m of messages" [ngClass]="m.role">
      <div class="avatar">{{ m.role === 'assistant' ? 'M' : 'Vous' }}</div>
      <div class="bubble">{{ m.text }}</div>
      <div class="message-time">{{ formatTime(m.at) }}</div>
    </div>

    <div class="typing" *ngIf="isLoading">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span>Analyse en cours...</span>
    </div>
  </div>

  <div class="suggestions" *ngIf="suggestions.length > 0">
    <span class="suggestions-label">Suggestions</span>
    <button type="button" class="suggestion-btn" *ngFor="let suggestion of suggestions" (click)="useSuggestion(suggestion)">
      {{ suggestion }}
    </button>
  </div>

  <form class="chatbot-input" (ngSubmit)="send()">
    <textarea
      [(ngModel)]="text"
      name="chatbotText"
      rows="3"
      placeholder="Tapez votre question..."
      aria-label="Message à envoyer"
      [disabled]="isLoading"></textarea>

    <div class="input-actions">
      <button type="submit" class="send-btn" [disabled]="!text.trim() || isLoading">Envoyer</button>
    </div>
  </form>
</section>
`,
  styleUrls: ['./chatbot-widget.component.scss']
})
export class ChatbotWidgetComponent implements OnInit {
  @ViewChild('chatBody') private readonly chatBody?: ElementRef<HTMLDivElement>;

  isOpen = false;
  isLoading = false;
  text = '';
  conversationId = '';
  messages: WidgetMessage[] = [];
  private readonly maxMessages = 30;
  private readonly defaultSuggestions = [
    'Quelles sont mes informations d\'accès ?',
    'Liste les utilisateurs du service Urgences',
    'Où trouver mes demandes ?'
  ];
  suggestions: string[] = [];

  constructor(private readonly chatbotService: ChatbotService) {}

  ngOnInit(): void {
    this.suggestions = this.defaultSuggestions.slice();
    this.restoreState();
    if (this.messages.length === 0) {
      this.appendAssistantMessage('Bonjour, je suis l\'assistant MediPlan. Je peux vous aider sur le planning, les compteurs RC, les règles, les demandes, les accès et les données visibles selon votre rôle.');
    }

    this.scrollToBottom();
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.persistState();
    this.scrollToBottom();
  }

  send(): void {
    const message = (this.text || '').trim();
    if (!message || this.isLoading) {
      return;
    }

    this.appendUserMessage(message);
    this.text = '';
    this.isLoading = true;

    this.chatbotService.sendMessage({
      message,
      conversationId: this.conversationId || undefined,
      userId: this.getCurrentUserId()
    }).subscribe({
      next: (res) => {
        this.onResponse(res);
      },
      error: () => {
        this.appendAssistantMessage('Le service chatbot est indisponible pour le moment. Veuillez réessayer.');
      },
      complete: () => {
        this.isLoading = false;
        this.trimMessages();
        this.persistState();
      }
    });
  }

  useSuggestion(suggestion: string): void {
    this.text = suggestion;
    this.send();
  }

  clearConversation(): void {
    this.messages = [];
    this.conversationId = '';
    this.suggestions = this.defaultSuggestions.slice();
    this.persistState();
    this.scrollToBottom();
  }

  private onResponse(res: ChatbotResponse): void {
    if (res.conversationId) {
      this.conversationId = res.conversationId;
    }

    if (Array.isArray(res.suggestions) && res.suggestions.length > 0) {
      this.suggestions = res.suggestions.slice(0, 3);
    }

    this.appendAssistantMessage(res.reply || 'Je n\'ai pas de réponse à proposer.');
  }

  private appendUserMessage(text: string): void {
    this.messages.push({ role: 'user', text, at: new Date().toISOString() });
    this.scrollToBottom();
  }

  private appendAssistantMessage(text: string): void {
    this.messages.push({ role: 'assistant', text, at: new Date().toISOString() });
    this.scrollToBottom();
  }

  formatTime(at: string): string {
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  get roleLabel(): string {
    const role = (localStorage.getItem('role') || '').toLowerCase();
    switch (role) {
      case 'super-admin':
      case 'admin-gta':
        return 'Accès global';
      case 'chef-service':
        return 'Chef de service';
      case 'chef-pole':
        return 'Chef de pôle';
      default:
        return 'Accès personnel';
    }
  }

  get roleHint(): string {
    const role = (localStorage.getItem('role') || '').toLowerCase();
    switch (role) {
      case 'super-admin':
      case 'admin-gta':
        return 'Tous les services et pôles';
      case 'chef-service':
        return 'Votre service uniquement';
      case 'chef-pole':
        return 'Les services de votre pôle';
      default:
        return 'Vos données personnelles';
    }
  }

  private getCurrentUserId(): number | undefined {
    const raw = localStorage.getItem('idUser');
    if (!raw) {
      return undefined;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private storageKey(): string {
    const userId = localStorage.getItem('idUser') || 'anonymous';
    return `chatbot_widget_state_${userId}`;
  }

  private restoreState(): void {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as {
        isOpen?: boolean;
        conversationId?: string;
        messages?: WidgetMessage[];
        suggestions?: string[];
      };

      this.isOpen = !!parsed.isOpen;
      this.conversationId = parsed.conversationId || '';
      this.messages = Array.isArray(parsed.messages) ? parsed.messages.slice(-this.maxMessages) : [];
      if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
        this.suggestions = parsed.suggestions.slice(0, 3);
      } else {
        this.suggestions = this.defaultSuggestions.slice();
      }
    } catch {
      this.isOpen = false;
      this.conversationId = '';
      this.messages = [];
      this.suggestions = this.defaultSuggestions.slice();
    }
  }

  private persistState(): void {
    const payload = {
      isOpen: this.isOpen,
      conversationId: this.conversationId,
      messages: this.messages.slice(-this.maxMessages),
      suggestions: this.suggestions.slice(0, 3)
    };

    localStorage.setItem(this.storageKey(), JSON.stringify(payload));
  }

  private scrollToBottom(): void {
    const element = this.chatBody?.nativeElement;
    if (!element) {
      return;
    }

    queueMicrotask(() => {
      element.scrollTop = element.scrollHeight;
    });
  }

  private trimMessages(): void {
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(this.messages.length - this.maxMessages);
    }
  }
}
