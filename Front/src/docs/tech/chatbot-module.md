# Module Chatbot IA - MediPlan

## Vue d'ensemble
Le chatbot MediPlan est expose via l'endpoint backend `POST /api/chat` et un widget flottant Angular disponible sur toutes les pages.

## Intentions supportees (version de base)
- `planning_week`: planning personnel de la semaine
- `planning_tomorrow`: planning de demain
- `counters`: solde RC+ / RC-
- `rules`: regles de repos / garde
- `procedure`: demarches absence / recuperation
- `request_status`: statut des demandes utilisateur
- `manager`: identification du chef de service
- `workflow_status`: etat du dernier planning soumis
- `prepare_create_request`: preparation d'une demande
- `confirm_create_request`: confirmation et creation de la demande
- `fallback`: reponse guidee

## Sources de donnees utilisees
- `StaffStore`:
  - `GetUserPlanningAsync`
  - `GetByIdAsync`
- `PlanningStore`:
  - `GetUserTimeCountersAsync`
  - `GetUserPlanningRequestsAsync`
  - `CreateUserPlanningRequestAsync`
  - `GetPlanningsWorkflowAsync`
- `StructureStore`:
  - `GetServicesAsync`

## Endpoint backend
- URL: `POST /api/chat`
- Headers recommandes:
  - `X-User-Id`
  - `X-User-Name`
- Payload:
```json
{
  "message": "Quel est mon planning cette semaine ?",
  "conversationId": "optional",
  "userId": 12
}
```

- Reponse:
```json
{
  "reply": "Voici votre planning...",
  "intent": "planning_week",
  "conversationId": "abc123",
  "suggestions": ["..."],
  "actionPending": false
}
```

## Integration frontend
- Service: `Front/src/app/demo/service/chatbot.service.ts`
- Composant:
  - `Front/src/app/shared/chatbot-widget/chatbot-widget.component.ts`
  - `Front/src/app/shared/chatbot-widget/chatbot-widget.component.html`
  - `Front/src/app/shared/chatbot-widget/chatbot-widget.component.scss`
- Insertion globale dans `Front/src/app/app.component.html`

## Configuration Azure OpenAI (optionnelle)
Dans `Backend/appsettings.json`:
```json
"Chatbot": {
  "UseAzureOpenAI": false,
  "AzureOpenAIEndpoint": "https://<resource>.openai.azure.com",
  "AzureOpenAIKey": "<api-key>",
  "AzureOpenAIDeployment": "gpt-4o-mini",
  "TimeoutMs": 1800
}
```

Quand `UseAzureOpenAI=true`, le chatbot utilise Azure OpenAI en fallback (intent `fallback`) si aucune intention locale n'est reconnue.

## Confidentialite et securite
- Les donnees metier restent traitees cote backend.
- Le backend identifie l'utilisateur via `X-User-Id` / payload.
- Ne jamais transmettre de mot de passe ou donnees sensibles au LLM externe.

## Exemples de questions
- "Quel est mon planning cette semaine ?"
- "Combien d'heures RC+ me reste-t-il ?"
- "Quelles sont les regles de repos apres une garde ?"
- "Comment faire une demande d'absence ?"
- "Ou en est ma demande du 15 avril ?"
- "Qui est mon chef de service ?"
- "Je veux demander une recuperation le 20 mai de 09:00 a 16:00"
