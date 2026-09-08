import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { volumeHighOutline } from 'ionicons/icons';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { db } from '../../core/db';
import { Speech } from '../../core/speech';
import { isLearnable } from '../../core/srs';
import type { Chapter, Word } from '../../core/models';

/**
 * Грамматический параграф: слов для заучивания в нём нет, а термины есть.
 * Издатель помечает их «Dit woord hoef je niet te leren», и тренировать их
 * действительно незачем — но `voltooid deelwoord` встречается в заданиях
 * учебника и в речи преподавателя, так что узнавать его нужно. Поэтому здесь
 * список на чтение: без вариантов, без счёта и без прогресса.
 */
@Component({
  selector: 'app-terms-page',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonProgressBar,
    RouterLink,
  ],
  styleUrl: './terms-page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/chapters" />
        </ion-buttons>
        <ion-title>Параграф {{ chapterId() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (loading()) {
        <ion-progress-bar type="indeterminate" aria-label="Загрузка терминов" />
      } @else {
        <div class="layout">
          @if (chapter(); as info) {
            <header class="head">
              <h1 class="head__nl">{{ info.title }}</h1>
              @if (info.titleRu) {
                <p class="head__ru">{{ info.titleRu }}</p>
              }
            </header>
          }

          @if (terms().length) {
            <p class="intro">
              <span class="intro__nl">Grammatica — dit hoef je niet te leren.</span>
              <span class="intro__ru">
                Грамматические термины параграфа. Заучивать их не нужно, но они встречаются
                в заданиях учебника — их стоит узнавать.
              </span>
            </p>

            <ion-list>
              @for (term of terms(); track term.id) {
                <ion-item>
                  <ion-label>
                    <h2>{{ full(term) }}</h2>
                    <p>{{ term.ru }}</p>
                    @if (term.plural) {
                      <ion-note>мн. ч.: {{ term.plural }}</ion-note>
                    }
                  </ion-label>
                  <!-- Кнопки нет, когда нидерландского голоса в системе нет: молчание
                       честнее, чем термин, прочитанный чужим языком. -->
                  @if (speech.available()) {
                    <ion-button
                      class="listen"
                      slot="end"
                      fill="clear"
                      [attr.aria-label]="'Произнести: ' + full(term)"
                      (click)="pronounce(term)"
                    >
                      <ion-icon slot="icon-only" name="volume-high-outline" />
                    </ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          } @else {
            <p class="intro">В этом параграфе нет ни слов, ни терминов.</p>
          }

          <ion-button class="back" expand="block" fill="outline" routerLink="/chapters">
            К списку параграфов
          </ion-button>
        </div>
      }
    </ion-content>
  `,
})
export class TermsPage {
  private readonly route = inject(ActivatedRoute);
  protected readonly speech = inject(Speech);

  protected readonly chapterId = signal(this.route.snapshot.paramMap.get('chapterId') ?? '');
  protected readonly chapter = signal<Chapter | null>(null);
  protected readonly terms = signal<Word[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    addIcons({ volumeHighOutline });
    void this.load();
  }

  /** Термин с артиклем: `de tegenwoordige tijd`, а не `tegenwoordige tijd`. */
  protected full(term: Word): string {
    return term.article ? `${term.article} ${term.nl}` : term.nl;
  }

  /**
   * Произносится термин целиком, с артиклем: `de voltooide tijd` — так он и
   * звучит в задании учебника. Только по нажатию: экран читают глазами, и
   * заговорить сам он не должен.
   */
  protected pronounce(term: Word): void {
    this.speech.speak(this.full(term));
  }

  private async load(): Promise<void> {
    try {
      const id = this.chapterId();
      const [chapter, words] = await Promise.all([
        db.chapters.get(id),
        db.words.where('chapterId').equals(id).toArray(),
      ]);

      this.chapter.set(chapter ?? null);
      this.terms.set(words.filter((word) => !isLearnable(word)));
    } finally {
      this.loading.set(false);
    }
  }
}
