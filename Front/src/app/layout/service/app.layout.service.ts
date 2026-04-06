import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface AppConfig {
  colorScheme: 'light' | 'dark';
  menuMode: 'overlay' | 'static' | 'slim' | 'horizontal';
  scale: number;
  inputStyle: 'outlined' | 'filled';
  ripple: boolean;
  theme?: string;
}

export interface AppState {
  staticMenuDesktopInactive: boolean;
  overlayMenuActive: boolean;
  profileSidebarVisible: boolean;
  configSidebarVisible: boolean;
  sidebarActive: boolean;
  anchored: boolean;
  staticMenuMobileActive: boolean;
  menuHoverActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class LayoutService {

  state: AppState = {
    staticMenuDesktopInactive: false,
    overlayMenuActive: false,
    profileSidebarVisible: false,
    configSidebarVisible: false,
    sidebarActive: false,
    anchored: false,
    staticMenuMobileActive: false,
    menuHoverActive: false
  };

  config: AppConfig = {
    colorScheme: 'light',
    menuMode: 'static',
    scale: 14,
    inputStyle: 'outlined',
    ripple: true
  };

  public overlayOpen$ = new Subject<any>();
  public onMenuToggle$ = new Subject<any>();
  public onConfigUpdate$ = new Subject<AppConfig>();
  public onSidebarToggle$ = new Subject<any>();
  public onProfileSidebarToggle$ = new Subject<any>();
  public configUpdate$ = new Subject<AppConfig>();

  constructor() { }

  toggleMenu(): void {
    this.state.overlayMenuActive = !this.state.overlayMenuActive;
    this.onMenuToggle$.next(null);
    this.overlayOpen$.next(null);
  }

  toggleSidebar(): void {
    this.state.sidebarActive = !this.state.sidebarActive;
    this.onSidebarToggle$.next(null);
  }

  toggleProfileSidebar(): void {
    this.state.profileSidebarVisible = !this.state.profileSidebarVisible;
    this.onProfileSidebarToggle$.next(null);
  }

  showConfigSidebar(): void {
    this.state.configSidebarVisible = true;
  }

  hideConfigSidebar(): void {
    this.state.configSidebarVisible = false;
  }

  updateConfig(config: Partial<AppConfig>): void {
    this.config = { ...this.config, ...config };
    this.onConfigUpdate$.next(this.config);
    this.configUpdate$.next(this.config);
  }

  getState(): AppState {
    return this.state;
  }

  getConfig(): AppConfig {
    return this.config;
  }
}
