import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addIcons } from 'ionicons';
import { informationCircleOutline } from 'ionicons/icons';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonNote,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Quiz, type Direction, type Question } from '../../core/quiz';
import { Srs } from '../../core/srs';
import {
  AUXILIARY_BOTH,
  AUXILIARY_RULES,
  auxiliaryHint,
  type AuxiliaryHint,
} from '../../core/auxiliary';

/** Сколько слов в одном заходе. */
const SESSION_SIZE = 10;
/** Варианты выбираются клавишами 1..4 — на десктопе это быстрее мыши. */
const OPTION_KEYS = ['1', '2', '3', '4'];

/**
 * Подписи интерфейса на двух языках: нидерландский крупно, русский подсказкой.
 * Эти фразы попадаются десятки раз за сессию — дешёвый способ их усвоить.
 */
const PROMPTS: Record<Direction, { nl: string; ru: string }> = {
  'nl-ru': { nl: 'Wat betekent dit?', ru: 'Как переводится?' },
  'ru-nl': { nl: 'Hoe zeg je dit in het Nederlands?', ru: 'Как по-нидерландски?' },
};

/** У вопроса про артикль своя подпись: направление перевода тут ни при чём. */
const ARTICLE_PROMPT = { nl: 'de of het?', ru: 'Какой артикль?' };

/** Для форм глагола подпись зависит от того, что именно спрашивают. */
const VERB_PROMPTS: Record<string, { nl: string; ru: string }> = {
  'verleden tijd': { nl: 'verleden tijd', ru: 'Прошедшее время' },
  'voltooide tijd': { nl: 'voltooide tijd', ru: 'Перфект' },
};

/** goed / fout — стандартная пара «правильно / неправильно» в нидерландских заданиях. */
const VERDICTS = {
  right: { nl: 'Goed!', ru: 'Верно' },
  wrong: { nl: 'Fout', ru: 'Неверно' },
};

@Component({
  selector: 'app-quiz-page',
  host: { '(document:keydown)': 'onKey($event)' },
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
    IonIcon,
    IonModal,
    RouterLink,
  ],
  styleUrl: './quiz-page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/chapters" />
        </ion-buttons>
        <ion-title>{{ title() }}</ion-title>
        <ion-note slot="end" class="score">{{ position() }} · верно {{ correct() }}</ion-note>
      </ion-toolbar>
      @if (!finished()) {
        <ion-progress-bar [value]="progress()" />
      }
    </ion-header>

    <ion-content class="ion-padding">
      @if (loading()) {
        <ion-progress-bar type="indeterminate" aria-label="Готовим вопросы" />
      } @else if (finished()) {
        <div class="result layout">
          <p class="result__score">{{ correct() }} из {{ questions().length }}</p>
          <p class="result__note">{{ verdict() }}</p>
          <ion-button expand="block" (click)="restart()">Ещё раз</ion-button>
          <ion-button expand="block" fill="outline" routerLink="/chapters">
            К списку параграфов
          </ion-button>
        </div>
      } @else if (current(); as question) {
        <div class="layout">
          <p class="direction">
            <span class="direction__nl">{{ prompt(question).nl }}</span>
            <span class="direction__ru">{{ prompt(question).ru }}</span>
          </p>
          <p class="prompt">{{ question.prompt }}</p>

          <div class="options">
            @for (option of question.options; track option; let i = $index) {
              <ion-button
                expand="block"
                size="large"
                [fill]="fillFor(i)"
                [color]="colorFor(i)"
                [disabled]="chosen() !== null"
                (click)="choose(i)"
              >
                {{ option }}
              </ion-button>
            }
          </div>

          <div class="review" role="status" aria-live="polite">
            @if (chosen() !== null) {
              <p
                class="review__verdict"
                [class.review__verdict--right]="chosen() === question.correctIndex"
                [class.review__verdict--wrong]="chosen() !== question.correctIndex"
              >
                <span class="review__verdict-nl">{{ verdictLabel(question).nl }}</span>
                <span class="review__verdict-ru">{{ verdictLabel(question).ru }}</span>
              </p>
              <p class="review__word">{{ full(question) }} — {{ question.word.ru }}</p>
              @if (meta(question); as line) {
                <p class="review__meta">{{ line }}</p>
              }
              @if (hint(question); as rule) {
                <p class="review__rule">
                  <ion-button
                    class="review__rule-info"
                    fill="clear"
                    size="small"
                    aria-label="Правило hebben и zijn"
                    (click)="ruleOpen.set(true)"
                  >
                    <ion-icon slot="icon-only" name="information-circle-outline" />
                  </ion-button>
                  <span class="review__rule-nl">{{ rule.nl }}</span>
                  <span class="review__rule-ru">{{ rule.ru }}</span>
                  @if (rule.example) {
                    <span class="review__rule-example">{{ rule.example }}</span>
                  }
                </p>
              }
              @if (question.word.example; as example) {
                <p class="review__example">
                  <em>{{ example.nl }}</em> — {{ example.ru }}
                </p>
              }
              <ion-button class="review__next" expand="block" (click)="next()">
                {{ isLast() ? 'Resultaat' : 'Volgende' }}
              </ion-button>
            }
          </div>
        </div>
      } @else {
        <p class="layout">
          @if (chapterIdIsSet()) {
            В этом параграфе нет слов для тренировки.
          } @else if (isArticlesMode()) {
            Артикли на сегодня повторены. Загляни завтра.
          } @else if (isVerbsMode()) {
            Глаголы на сегодня повторены. Загляни завтра.
          } @else {
            На сегодня всё повторено. Загляни завтра или выбери параграф.
          }
        </p>
      }
    </ion-content>

    <ion-modal [isOpen]="ruleOpen()" (didDismiss)="ruleOpen.set(false)">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>Wanneer zijn?</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="ruleOpen.set(false)">Sluiten</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <p class="rule__intro">
            Перфект строится с <strong>zijn</strong> в трёх случаях. У остальных глаголов —
            <strong>hebben</strong>.
          </p>

          @for (rule of rules; track rule.ru) {
            <div class="rule">
              <p class="rule__nl">{{ rule.nl }}</p>
              <p class="rule__ru">{{ rule.ru }}</p>
              <p class="rule__verbs">{{ rule.verbs.join(', ') }}</p>
            </div>
          }

          <h2 class="rule__heading">Оба варианта</h2>
          @for (rule of bothRules; track rule.ru) {
            <div class="rule">
              <p class="rule__ru">{{ rule.ru }}</p>
              <p class="rule__example">{{ rule.example }}</p>
              <p class="rule__verbs">{{ rule.verbs.join(', ') }}</p>
            </div>
          }
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
})
export class QuizPage {
  private readonly route = inject(ActivatedRoute);
  private readonly quiz = inject(Quiz);
  private readonly srs = inject(Srs);

  /** Пусто — значит режим не привязан к параграфу. */
  private readonly chapterId = this.route.snapshot.paramMap.get('chapterId') ?? '';
  /** Режим тренировки артиклей включается отдельным адресом. */
  private readonly articlesMode = this.route.snapshot.url.some((s) => s.path === 'articles');
  /** Режим форм неправильных глаголов. */
  private readonly verbsMode = this.route.snapshot.url.some((s) => s.path === 'verbs');

  protected readonly questions = signal<Question[]>([]);
  protected readonly index = signal(0);
  protected readonly chosen = signal<number | null>(null);
  protected readonly correct = signal(0);
  protected readonly loading = signal(true);
  protected readonly ruleOpen = signal(false);
  protected readonly rules = AUXILIARY_RULES;
  protected readonly bothRules = AUXILIARY_BOTH;

  protected readonly current = computed(() => this.questions()[this.index()]);
  protected readonly finished = computed(
    () => !this.loading() && this.questions().length > 0 && this.index() >= this.questions().length,
  );
  protected readonly progress = computed(() =>
    this.questions().length ? this.index() / this.questions().length : 0,
  );
  protected readonly title = computed(() => {
    if (this.articlesMode) return 'de of het';
    if (this.verbsMode) return 'Werkwoorden';
    return this.chapterId ? `Параграф ${this.chapterId}` : 'Herhalen';
  });

  protected readonly verdict = computed(() => {
    const total = this.questions().length;
    if (!total) return '';
    const ratio = this.correct() / total;
    if (ratio === 1) return 'Все верно. Uitstekend!';
    if (ratio >= 0.7) return 'Хороший результат, эти слова почти закрепились.';
    return 'Эти слова стоит повторить завтра.';
  });

  protected readonly position = computed(
    () => `${Math.min(this.index() + 1, this.questions().length)} / ${this.questions().length}`,
  );

  protected chapterIdIsSet(): boolean {
    return this.chapterId !== '';
  }

  protected isArticlesMode(): boolean {
    return this.articlesMode;
  }

  protected isVerbsMode(): boolean {
    return this.verbsMode;
  }

  /** Правило выбора hebben/zijn — показываем там, где оно неочевидно. */
  protected hint(question: Question): AuxiliaryHint | null {
    return question.skill === 'verb' ? auxiliaryHint(question.word) : null;
  }

  protected prompt(question: Question): { nl: string; ru: string } {
    if (question.skill === 'article') return ARTICLE_PROMPT;
    if (question.subPrompt) return VERB_PROMPTS[question.subPrompt];
    return PROMPTS[question.direction];
  }

  protected verdictLabel(question: Question): { nl: string; ru: string } {
    return this.chosen() === question.correctIndex ? VERDICTS.right : VERDICTS.wrong;
  }

  /** Слово в том виде, в каком его стоит запомнить: существительное — с артиклем. */
  protected full(question: Question): string {
    const word = question.word;
    if (!word.article) return word.nl;
    // В режиме артиклей полезно сразу видеть и множественное число: у het-слов
    // оно часто и есть та зацепка, по которой артикль вспоминается.
    const plural = question.skill === 'article' && word.plural ? ` · de ${word.plural}` : '';
    return `${word.article} ${word.nl}${plural}`;
  }

  /**
   * Строка с грамматикой: то, что как раз пора вспомнить в момент ответа —
   * множественное число, формы глагола, ударение.
   */
  protected meta(question: Question): string {
    const word = question.word;
    const parts: string[] = [];

    if (word.plural && word.plural !== word.nl) parts.push(`мн. ч.: ${word.plural}`);
    if (word.inflected) parts.push(word.inflected);

    const forms = word.verbForms;
    if (forms) {
      const past = forms.pastPlural ? `${forms.past} / ${forms.pastPlural}` : forms.past;
      const perfect = forms.auxiliary ? `${forms.auxiliary} ${forms.participle}` : forms.participle;
      parts.push(`${past} · ${perfect}`);
      if (forms.separable) parts.push(`отделяемая: ${forms.separable}`);
    }

    if (word.stress) {
      const syllables = word.stress.syllables
        .map((s, i) => (i === word.stress!.index ? s.toUpperCase() : s))
        .join('-');
      parts.push(syllables);
    }

    return parts.join(' · ');
  }

  constructor() {
    addIcons({ informationCircleOutline });
    void this.load();
  }

  protected async choose(option: number): Promise<void> {
    if (this.chosen() !== null) return;

    const question = this.current();
    if (!question) return;

    this.chosen.set(option);
    const isCorrect = option === question.correctIndex;
    if (isCorrect) this.correct.update((n) => n + 1);

    await this.srs.answer(question.word.id, question.skill, isCorrect);

    // Автоперехода нет намеренно: разбор показывается до тех пор, пока
    // его не закроют. Момент ответа — единственный, когда грамматику читают.
  }

  /** 1..4 — выбор варианта, Enter или пробел — переход дальше. */
  protected onKey(event: KeyboardEvent): void {
    if (this.loading() || this.finished()) return;

    if (this.chosen() === null) {
      const option = OPTION_KEYS.indexOf(event.key);
      if (option >= 0 && option < (this.current()?.options.length ?? 0)) {
        event.preventDefault();
        void this.choose(option);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.next();
    }
  }

  protected readonly isLast = computed(() => this.index() === this.questions().length - 1);

  protected next(): void {
    this.chosen.set(null);
    this.index.update((i) => i + 1);
  }

  protected fillFor(option: number): 'solid' | 'outline' {
    const chosen = this.chosen();
    if (chosen === null) return 'outline';
    const question = this.current();
    // После ответа подсвечиваем правильный вариант, даже если выбран другой:
    // иначе ошибка не учит.
    return option === question?.correctIndex || option === chosen ? 'solid' : 'outline';
  }

  protected colorFor(option: number): string {
    const chosen = this.chosen();
    if (chosen === null) return 'primary';
    const question = this.current();
    if (option === question?.correctIndex) return 'success';
    return option === chosen ? 'danger' : 'medium';
  }

  protected restart(): void {
    this.index.set(0);
    this.chosen.set(null);
    this.correct.set(0);
    void this.load();
  }

  private collect(): Promise<Question[]> {
    if (this.articlesMode) return this.quiz.forArticles(SESSION_SIZE);
    if (this.verbsMode) return this.quiz.forVerbs(SESSION_SIZE);
    if (this.chapterId) return this.quiz.forChapter(this.chapterId, SESSION_SIZE);
    return this.quiz.forToday(SESSION_SIZE);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.questions.set(await this.collect());
    this.loading.set(false);
  }
}
