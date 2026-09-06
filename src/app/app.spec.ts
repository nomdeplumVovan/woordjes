import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideIonicAngular({}),
        provideRouter([]),
        // В тестовой среде service worker недоступен: выключаем, чтобы
        // SwUpdate можно было внедрить.
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ],
    }).compileComponents();
  });

  it('монтирует оболочку Ionic', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('ion-app')).toBeTruthy();
    expect(root.querySelector('ion-router-outlet')).toBeTruthy();
  });
});
