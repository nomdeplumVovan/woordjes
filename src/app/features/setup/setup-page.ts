import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonNote,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Library, WrongFileError, type ImportResult } from '../../core/library';
import { Speech } from '../../core/speech';

/** Ошибки pdf.js приходят и не-Error значениями, поэтому приводим руками. */
function describe(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return String(cause);
}

@Component({
  selector: 'app-setup-page',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonButton,
    IonNote,
    IonProgressBar,
    RouterLink,
  ],
  styleUrl: './setup-page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        @if (hasData()) {
          <ion-buttons slot="start">
            <ion-back-button defaultHref="/chapters" />
          </ion-buttons>
        }
        <ion-title>Woordenlijst</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="layout">
        <p class="intro">
          Приложение не поставляется со словарём: каждый загружает свой файл из личного кабинета
          <strong>leren.kleurrijker.nl</strong>. Разбор идёт прямо на устройстве, файл никуда не
          отправляется.
        </p>

        <ol class="steps">
          <li>Открой <strong>TaalCompleet A2 → EXTRA → Woordenlijsten</strong></li>
          <li>Скачай PDF кнопкой загрузки</li>
          <li>Выбери его здесь</li>
        </ol>

        <p class="intro">
          Оттуда же стоит взять <strong>Onregelmatige werkwoorden</strong> — без него не будет
          режима форм глаголов. Файлы можно загружать в любом порядке.
        </p>

        <input
          #picker
          class="picker"
          type="file"
          accept="application/pdf,.pdf"
          [disabled]="busy()"
          (change)="pick($event)"
        />

        <ion-button expand="block" [disabled]="busy()" (click)="picker.click()">
          Выбрать PDF
        </ion-button>

        @if (busy()) {
          <ion-progress-bar [value]="progress()" />
          <p class="status">Разбираю страницу {{ page() }} из {{ total() }}…</p>
        }

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <!-- Причина мелким шрифтом: на телефоне консоли нет, а текст можно переслать. -->
        @if (cause(); as detail) {
          <p class="cause">{{ detail }}</p>
        }

        @if (result(); as done) {
          <div class="done" role="status">
            @if (done.kind === 'woordenlijst') {
              <p>
                <strong>{{ done.words }}</strong> слов в {{ done.chapters }} параграфах
              </p>
              @if (done.skipped) {
                <ion-note>не разобрано записей: {{ done.skipped }}</ion-note>
              }
            } @else {
              <p>
                Неправильных глаголов: <strong>{{ done.verbs }}</strong>
              </p>
            }
          </div>
        }

        @if (hasData()) {
          <ion-button expand="block" fill="outline" routerLink="/chapters">К параграфам</ion-button>
        }

        <!--
          Статус голоса виден заранее: иначе отсутствие кнопки «прослушать»
          в тренировке выглядело бы поломкой приложения.
        -->
        <h2 class="section">Uitspraak</h2>
        @if (speech.available()) {
          <p class="intro">
            Голос найден: <strong>{{ speech.voiceName() }}</strong>. В разборе ответа есть кнопка
            «прослушать».
          </p>
        } @else {
          <p class="intro">
            Нидерландского голоса в системе нет, поэтому произношение выключено: прочитать
            <strong>huis</strong> английским голосом хуже, чем промолчать.
          </p>
          <p class="intro">
            На iPhone голос добавляется в Настройки → Универсальный доступ → Устный контент →
            Голоса → Nederlands. Если после установки кнопка не появилась, добавьте Nederlands
            ещё и в Настройки → Основные → Язык и регион → Предпочитаемые языки: Safari берёт
            голоса оттуда. На Windows — языковым пакетом в параметрах речи.
          </p>
          @if (speech.languages(); as langs) {
            <p class="cause">
              @if (langs.length) {
                Синтезатор предлагает: {{ langs.join(', ') }}
              } @else {
                Синтезатор не вернул ни одного голоса.
              }
            </p>
          }
        }

        <ion-button fill="outline" expand="block" [disabled]="busy()" (click)="checkVoice()">
          Проверить голос
        </ion-button>
        @if (voiceCheck(); as verdict) {
          <p class="cause" role="status">{{ verdict }}</p>
        }
      </div>
    </ion-content>
  `,
})
export class SetupPage {
  private readonly library = inject(Library);
  protected readonly speech = inject(Speech);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly page = signal(0);
  protected readonly total = signal(0);
  protected readonly error = signal<string | null>(null);
  /** Текст исключения: показываем мелким шрифтом под сообщением. */
  protected readonly cause = signal<string | null>(null);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly voiceCheck = signal<string | null>(null);

  protected readonly progress = signal(0);
  protected readonly hasData = this.library.chapterCount;

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.busy.set(true);
    this.error.set(null);
    this.cause.set(null);
    this.result.set(null);

    try {
      const done = await this.library.importPdf(file, ({ page, total }) => {
        this.page.set(page);
        this.total.set(total);
        this.progress.set(total ? page / total : 0);
      });
      this.result.set(done);
    } catch (cause) {
      if (cause instanceof WrongFileError) {
        this.error.set(cause.message);
      } else {
        this.error.set('Не удалось прочитать файл. Убедись, что это PDF из личного кабинета.');
        this.cause.set(describe(cause));
      }
    } finally {
      this.busy.set(false);
      // Позволяем выбрать тот же файл повторно после ошибки.
      input.value = '';
    }
  }

  /** Произносит пробное слово: молчание синтезатора надо уметь отличить от отказа. */
  protected async checkVoice(): Promise<void> {
    this.voiceCheck.set('Проверяю…');
    this.voiceCheck.set(await this.speech.test());
  }
}
