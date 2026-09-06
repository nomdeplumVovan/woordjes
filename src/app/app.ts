import { Component, inject, signal } from '@angular/core';
import { IonApp, IonButton, IonRouterOutlet } from '@ionic/angular';
import { Updates } from './core/updates';

@Component({
  imports: [IonApp, IonRouterOutlet, IonButton],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly updates = inject(Updates);
  protected readonly updateReady = signal(false);

  constructor() {
    this.updates.start();
    this.updates.ready.subscribe(() => this.updateReady.set(true));
  }

  protected apply(): void {
    void this.updates.apply();
  }
}
