import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonItemDivider,
  IonItemGroup,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { RouterLink } from '@angular/router';
import { Quiz } from '../../core/quiz';
import { LEARNED_BOX, Srs } from '../../core/srs';
import { db } from '../../core/db';
import type { Chapter } from '../../core/models';

interface ChapterView extends Chapter {
  learned: number;
  ratio: number;
}

interface ThemeGroup {
  theme: number;
  themeTitle: string;
  chapters: ChapterView[];
  learned: number;
  total: number;
}

@Component({
  selector: 'app-chapters',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonItem,
    IonLabel,
    IonNote,
    IonBadge,
    IonProgressBar,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    RouterLink,
  ],
  styleUrl: './chapters.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Woordjes</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/backup">Back-up</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (error(); as message) {
        <p class="ion-padding" role="alert">{{ message }}</p>
      } @else if (loading()) {
        <ion-progress-bar type="indeterminate" aria-label="Загрузка словарей" />
      } @else {
        <div class="layout">
          <ion-card class="today">
            <ion-card-header>
              <ion-card-title>Herhalen</ion-card-title>
              <p class="today__subtitle">Повторение</p>
            </ion-card-header>
            <ion-card-content>
              <p class="today__line">
                @if (counts(); as c) {
                  @if (c.due) {
                    К повторению: <strong>{{ c.due }}</strong>
                  } @else {
                    Повторять пока нечего
                  }
                  · новых: {{ c.fresh }} · выучено: {{ c.learned }}
                }
              </p>
              <ion-button expand="block" routerLink="/review">Beginnen</ion-button>
            </ion-card-content>
          </ion-card>

          <ion-card class="today">
            <ion-card-header>
              <ion-card-title>de of het</ion-card-title>
              <p class="today__subtitle">Артикли</p>
            </ion-card-header>
            <ion-card-content>
              <p class="today__line">
                @if (counts(); as c) {
                  @if (c.articlesDue) {
                    К повторению: <strong>{{ c.articlesDue }}</strong>
                  } @else {
                    Повторять пока нечего
                  }
                  · новых: {{ c.articlesFresh }} · выучено: {{ c.articlesLearned }}
                }
              </p>
              <ion-button expand="block" fill="outline" routerLink="/articles">Oefenen</ion-button>
            </ion-card-content>
          </ion-card>

          <ion-card class="today">
            <ion-card-header>
              <ion-card-title>Werkwoorden</ion-card-title>
              <p class="today__subtitle">Формы неправильных глаголов</p>
            </ion-card-header>
            <ion-card-content>
              <p class="today__line">
                @if (counts(); as c) {
                  @if (c.verbsDue) {
                    К повторению: <strong>{{ c.verbsDue }}</strong>
                  } @else {
                    Повторять пока нечего
                  }
                  · новых: {{ c.verbsFresh }} · выучено: {{ c.verbsLearned }}
                }
              </p>
              <ion-button expand="block" fill="outline" routerLink="/verbs">Oefenen</ion-button>
            </ion-card-content>
          </ion-card>

          <ion-list>
            @for (group of themes(); track group.theme) {
              <ion-item-group>
                <ion-item-divider sticky>
                  <ion-label>Thema {{ group.theme }} · {{ group.themeTitle }}</ion-label>
                  <ion-note slot="end">{{ group.learned }} / {{ group.total }}</ion-note>
                </ion-item-divider>

                @for (chapter of group.chapters; track chapter.id) {
                  <ion-item button [detail]="true" [routerLink]="['/quiz', chapter.id]">
                    <ion-badge slot="start">{{ chapter.id }}</ion-badge>
                    <ion-label>
                      <h2>{{ chapter.title }}</h2>
                      <p>{{ chapter.titleRu }}</p>
                      <ion-progress-bar
                        [value]="chapter.ratio"
                        [attr.aria-label]="
                          'Выучено ' + chapter.learned + ' из ' + chapter.wordCount
                        "
                      />
                    </ion-label>
                    <ion-note slot="end">{{ chapter.learned }} / {{ chapter.wordCount }}</ion-note>
                  </ion-item>
                }
              </ion-item-group>
            } @empty {
              <p class="ion-padding">
                Словари пусты. Добавь параграф в <code>public/data</code> и впиши его в
                <code>index.json</code>.
              </p>
            }
          </ion-list>
        </div>
      }
    </ion-content>
  `,
})
export class Chapters {
  private readonly quiz = inject(Quiz);
  private readonly srs = inject(Srs);

  protected readonly chapters = signal<ChapterView[]>([]);
  protected readonly loading = signal(true);
  protected readonly counts = signal<Awaited<ReturnType<Quiz['counts']>> | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Параграфы сгруппированы по темам учебника: восемь тем по ~15 параграфов. */
  protected readonly themes = computed<ThemeGroup[]>(() => {
    const groups = new Map<number, ThemeGroup>();

    for (const chapter of this.chapters()) {
      let group = groups.get(chapter.theme);
      if (!group) {
        group = {
          theme: chapter.theme,
          themeTitle: chapter.themeTitle,
          chapters: [],
          learned: 0,
          total: 0,
        };
        groups.set(chapter.theme, group);
      }
      group.chapters.push(chapter);
      group.learned += chapter.learned;
      group.total += chapter.wordCount;
    }

    return [...groups.values()].sort((a, b) => a.theme - b.theme);
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.chapters.set(await this.readChapters());
      this.counts.set(await this.quiz.counts());
    } finally {
      this.loading.set(false);
    }
  }

  private async readChapters(): Promise<ChapterView[]> {
    const chapters = await db.chapters.orderBy('order').toArray();
    // Прогресс в списке параграфов — про перевод: он основной навык.
    const translation = await this.srs.byWord('translation');
    const learnedIds = new Set(
      [...translation.values()].filter((p) => p.box >= LEARNED_BOX).map((p) => p.wordId),
    );

    return Promise.all(
      chapters.map(async (chapter) => {
        const ids = await db.words.where('chapterId').equals(chapter.id).primaryKeys();
        const learned = ids.filter((id) => learnedIds.has(id)).length;
        return { ...chapter, learned, ratio: chapter.wordCount ? learned / chapter.wordCount : 0 };
      }),
    );
  }
}
