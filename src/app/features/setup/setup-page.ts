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

/** Ошибки pdf.js приходят и не-Error значениями, поэтому приводим руками. */
function describe(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return String(cause);
}

/**
 * Параметры файла рядом с ошибкой. iCloud отдаёт выбранный файл не всегда
 * целиком, и нулевой размер отличает это от настоящей поломки разбора.
 */
function describeFile(file: File): string {
  const kb = Math.round(file.size / 1024);
  return `${file.name} · ${file.type || 'без типа'} · ${kb} КБ`;
}

/** Первые кадры стека: имя чанка отличает падение pdf.js от нашего кода. */
function stackOf(cause: unknown): string {
  if (!(cause instanceof Error) || !cause.stack) return '';
  return cause.stack.split('\n').slice(0, 4).join('\n');
}

/**
 * Стартует ли воркер pdf.js в этом браузере. Ошибка загрузки приходит
 * событием, а не исключением, поэтому короткая тишина считается успехом.
 */
async function probeWorker(): Promise<string> {
  const url = new URL('pdf.worker.min.mjs', document.baseURI).toString();
  try {
    const worker = new Worker(url, { type: 'module' });
    const outcome = await new Promise<string>((resolve) => {
      const quiet = setTimeout(() => resolve('стартовал'), 1500);
      worker.addEventListener('error', (event) => {
        clearTimeout(quiet);
        resolve(event.message || 'не загрузился');
      });
    });
    worker.terminate();
    return `worker: ${outcome}`;
  } catch (cause) {
    return `worker: ${describe(cause)}`;
  }
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

        <!--
          Техническая причина рядом с человеческим текстом: без неё отладка на
          телефоне невозможна — консоли под рукой нет, а ошибка у каждого своя.
        -->
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
      </div>
    </ion-content>
  `,
})
export class SetupPage {
  private readonly library = inject(Library);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly page = signal(0);
  protected readonly total = signal(0);
  protected readonly error = signal<string | null>(null);
  /** Текст исключения: показываем мелким шрифтом под сообщением. */
  protected readonly cause = signal<string | null>(null);
  protected readonly result = signal<ImportResult | null>(null);

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
        this.cause.set(
          [describe(cause), describeFile(file), stackOf(cause), await probeWorker()]
            .filter(Boolean)
            .join('\n'),
        );
      }
    } finally {
      this.busy.set(false);
      // Позволяем выбрать тот же файл повторно после ошибки.
      input.value = '';
    }
  }
}
