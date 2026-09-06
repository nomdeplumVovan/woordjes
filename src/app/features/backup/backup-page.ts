import { Component, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { BadBackupError, Backup, type RestoreResult } from '../../core/backup';

@Component({
  selector: 'app-backup-page',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonNote,
  ],
  styleUrl: './backup-page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/chapters" />
        </ion-buttons>
        <ion-title>Back-up</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="layout">
        <p class="intro">
          Прогресс хранится только в этом браузере. Удалить приложение с домашнего экрана — значит
          потерять все коробки; у вкладки Safari и у иконки на экране хранилища вдобавок разные.
          Копия переносит занятия на другое устройство.
        </p>
        <p class="intro">
          В файл попадает только прогресс. Слова в нём не хранятся: их возвращает импорт словника.
        </p>

        <ion-button expand="block" [disabled]="busy()" (click)="save()">Opslaan</ion-button>
        <p class="hint">Сохранить копию</p>

        <input
          #picker
          class="picker"
          type="file"
          accept="application/json,.json"
          [disabled]="busy()"
          (change)="restore($event)"
        />
        <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="picker.click()">
          Herstellen
        </ion-button>
        <p class="hint">Восстановить из файла</p>

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        @if (saved()) {
          <p class="done" role="status">Копия сохранена.</p>
        }

        @if (restored(); as done) {
          <div class="done" role="status">
            <p>
              Восстановлено записей: <strong>{{ done.applied }}</strong>
            </p>
            @if (done.outdated) {
              <ion-note>пропущено как устаревшие: {{ done.outdated }}</ion-note>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class BackupPage {
  private readonly backup = inject(Backup);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly restored = signal<RestoreResult | null>(null);

  protected async save(): Promise<void> {
    this.reset();
    this.busy.set(true);
    try {
      this.saved.set(await this.backup.save());
    } catch {
      this.error.set('Не удалось сохранить копию.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async restore(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.reset();
    this.busy.set(true);
    try {
      this.restored.set(await this.backup.restore(file));
    } catch (cause) {
      this.error.set(
        cause instanceof BadBackupError
          ? cause.message
          : 'Не удалось восстановить прогресс из этого файла.',
      );
    } finally {
      this.busy.set(false);
      // Позволяем выбрать тот же файл повторно после ошибки.
      input.value = '';
    }
  }

  private reset(): void {
    this.error.set(null);
    this.saved.set(false);
    this.restored.set(null);
  }
}
