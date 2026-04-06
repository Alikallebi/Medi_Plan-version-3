import { NgModule } from '@angular/core';
import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms'; // <-- Pour ngModel
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'; // <-- Pour PrimeNG
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { AppLayoutModule } from './layout/app.layout.module';


// Services
import { CountryService } from './demo/service/country.service';
import { CustomerService } from './demo/service/customer.service';
import { EventService } from './demo/service/event.service';
import { IconService } from './demo/service/icon.service';
import { NodeService } from './demo/service/node.service';
import { PhotoService } from './demo/service/photo.service';

// PrimeNG modules
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

@NgModule({
    declarations: [
        AppComponent,
       
    ],
    imports: [
        BrowserModule,
        BrowserAnimationsModule,
        FormsModule,          // <-- Ajouté
        AppRoutingModule,
        AppLayoutModule,
        CheckboxModule,       // <-- Ajouté pour p-checkbox
        ButtonModule,         // <-- Ajouté pour pButton
        MessageModule         // <-- Ajouté pour p-message
    ],
    providers: [
        { provide: LocationStrategy, useClass: HashLocationStrategy },
        CountryService, CustomerService, EventService, IconService, NodeService,
        PhotoService,
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
