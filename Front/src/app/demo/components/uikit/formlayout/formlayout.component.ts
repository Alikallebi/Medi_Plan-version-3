import { Component, OnInit } from '@angular/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventService } from 'src/app/demo/service/event.service';
import { Event } from 'src/app/demo/api/event';
import { CalendarOptions, DateSelectArg, EventClickArg } from '@fullcalendar/core';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-formlayout',
  templateUrl: './formlayout.component.html',
  styleUrls: ['./formlayout.component.css'],
  providers: [MessageService]
})
export class FormLayoutComponent implements OnInit {
  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,dayGridWeek,dayGridDay'
    },
    editable: true,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: false,
    moreLinkClick: 'popover',
    events: [],
    select: this.handleDateSelect.bind(this),
    eventClick: this.handleEventClick.bind(this)
  };

  role: any;
  items: any[] = [];
  selectedEvent: any = null;
  displayAddDialog: boolean = false;
  displaySelectDialog: boolean = false;
  newEvent: { title: string, start: Date | null } = { title: '', start: null };
  eventOptions: any[] = [];
  displayDeleteDialog: boolean = false;
  selectedDeleteEvent: any = null;
  displayEventsDialog: boolean = false;
  eventsOfDay: any[] = [];

  constructor(private eventService: EventService, private messageService: MessageService) { }

  ngOnInit() {
    this.role = localStorage.getItem('role');
    this.loadEvents();

    this.items = [
      {
        icon: 'pi pi-plus',
        command: () => {
          this.displayAddDialog = true;
        }
      },
      {
        icon: 'pi pi-pencil',
        command: () => {
          this.loadEvents();
          this.displaySelectDialog = true;
        },
        visible: this.role == 'RH'
      },
      {
        icon: 'pi pi-trash',
        command: () => {
          this.displayDeleteDialog = true;
        },
        visible: this.role == 'RH'
      }
    ];
  }

  loadEvents(): void {
    this.eventService.getEvents().subscribe(
      (events: Event[]) => {
        this.calendarOptions.events = events.map(event => ({
          id: event.id?.toString() ?? '', // Convert id to string or use empty string if undefined
          title: event.title,
          start: new Date(event.start)
        }));
        this.eventOptions = events.map(event => ({
          id: event.id?.toString() ?? '', // Convert id to string or use empty string if undefined
          title: event.title,
          start: new Date(event.start)
        }));
      },
      (error) => {
        console.error('Erreur lors de la récupération des événements', error);
      }
    );
  }

  confirmAddEvent() {
    if (this.newEvent.title && this.newEvent.start) {
      const newEvent = { title: this.newEvent.title, start: this.newEvent.start.toISOString() };
      this.addEventToCalendar(newEvent.title, newEvent.start);
      this.newEvent = { title: '', start: null };
      this.displayAddDialog = false;
    } else {
      this.messageService.add({ severity: 'warn', summary: 'Avertissement', detail: 'Veuillez remplir tous les champs' });
    }
  }

  addEventToCalendar(title: string, date: string) {
    const newEvent = { title, start: date };

    this.eventService.addEvent(newEvent).subscribe(
      (event: Event) => {
        (this.calendarOptions.events as any[]).push(newEvent);
        this.messageService.add({ severity: 'success', summary: 'Ajouté', detail: 'Événement ajouté avec succès' });
      },
      (error) => {
        console.error('Erreur lors de l\'ajout de l\'événement', error);
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de l\'ajout de l\'événement' });
      }
    );
  }

  confirmUpdateEvent() {
    if (this.selectedEvent) {
      const updatedEvent = { title: this.selectedEvent.title, start: this.selectedEvent.start.toISOString() };
      this.updateEvent(updatedEvent, this.selectedEvent.id);
      this.displaySelectDialog = false;
    } else {
      this.messageService.add({ severity: 'warn', summary: 'Avertissement', detail: 'Veuillez sélectionner un événement' });
    }
  }

  updateEvent(event: any, eventId: number) {
    this.eventService.updateEvent(event, eventId).subscribe(
      (updatedEvent: Event) => {
        const eventIndex = (this.calendarOptions.events as any[]).findIndex(e => e.id === eventId);
        (this.calendarOptions.events as any[])[eventIndex] = { ...event, id: eventId };
        this.messageService.add({ severity: 'success', summary: 'Mis à jour', detail: 'Événement mis à jour avec succès' });
      },
      (error) => {
        console.error('Erreur lors de la mise à jour de l\'événement', error);
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la mise à jour de l\'événement' });
      }
    );
  }

  confirmDeleteEvent() {
    if (this.selectedDeleteEvent) {
      this.deleteEvent(this.selectedDeleteEvent);
      this.displayDeleteDialog = false;
    } else {
      this.messageService.add({ severity: 'warn', summary: 'Avertissement', detail: 'Veuillez sélectionner un événement à supprimer' });
    }
  }

  deleteEvent(event: any) {
    this.eventService.deleteEvent(event.id).subscribe(
      () => {
        this.calendarOptions.events = (this.calendarOptions.events as any[]).filter(e => e.id !== event.id);
        this.messageService.add({ severity: 'success', summary: 'Supprimé', detail: 'Événement supprimé avec succès' });
      },
      (error) => {
        console.error('Erreur lors de la suppression de l\'événement', error);
        this.messageService.add({ severity: 'error', summary: 'Erreur', detail: 'Erreur lors de la suppression de l\'événement' });
      }
    );
  }

  handleDateSelect(selectInfo: DateSelectArg) {
    const calendarApi = selectInfo.view.calendar;
    const selectedDate = selectInfo.startStr;
    const eventsOnSelectedDate = calendarApi.getEvents().filter(event => event.startStr === selectedDate);

    this.messageService.add({
      severity: 'info',
      summary: `Événements le ${selectedDate}`,
      detail: `Nombre total d'événements: ${eventsOnSelectedDate.length}`
    });
  }

  handleEventClick(clickInfo: EventClickArg) {
    const selectedDate = clickInfo.event.startStr;
    this.displayEventsDialog = true;

    // Get all events of the selected day
    const calendarApi = clickInfo.view.calendar;
    this.eventsOfDay = calendarApi.getEvents().filter(event => event.startStr.split('T')[0] === selectedDate.split('T')[0]);

    this.messageService.add({
      severity: 'info',
      summary: 'Événement',
      detail: `Titre: ${clickInfo.event.title}`
    });
  }
}
