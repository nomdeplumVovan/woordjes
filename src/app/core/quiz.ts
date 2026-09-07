import { Service, inject } from '@angular/core';
import { db } from './db';
import { LEARNED_BOX, Srs, hasArticle, isLearnable } from './srs';
import { isIrregularVerb, perfectOf, regularParticiple, regularPast } from './verbs';
import type { Chapter, Skill, Word } from './models';

/** Сколько вариантов показываем: правильный плюс три отвлекающих. */
const OPTIONS = 4;

/**
 * Служебные слова в переводах встречаются повсюду и не делают варианты
 * похожими: «потому что» и «только что» — разные значения.
 */
const STOP_WORDS = new Set(['что', 'как', 'это', 'или', 'для', 'при', 'над', 'под', 'без', 'the']);

export type Direction = 'nl-ru' | 'ru-nl';

export interface Question {
  word: Word;
  /** Какой навык проверяется этим вопросом. */
  skill: Skill;
  /** Что показываем: слово на нидерландском или перевод. */
  prompt: string;
  /** Уточнение к вопросу: какую именно форму спрашиваем. */
  subPrompt?: string;
  options: string[];
  correctIndex: number;
  direction: Direction;
}

/** Справочник параграфов и тем: нужен, чтобы искать соседей по смыслу. */
interface Context {
  pool: Word[];
  themeOf: Map<string, number>;
  chaptersOfTheme: Map<number, Set<string>>;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Значимые слова перевода: короткие служебные не в счёт. */
function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-zà-ÿа-яё]+/)
      .filter((part) => part.length > 2 && !STOP_WORDS.has(part)),
  );
}

function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const item of b) if (a.has(item)) return true;
  return false;
}

@Service()
export class Quiz {
  private readonly srs = inject(Srs);

  /** Вопросы по одному параграфу. */
  async forChapter(chapterId: string, size = 10): Promise<Question[]> {
    const context = await this.context();
    if (!context.themeOf.has(chapterId)) return [];

    const words = context.pool.filter((w) => w.chapterId === chapterId);
    return shuffle(words)
      .slice(0, size)
      .map((word) => this.buildQuestion(word, context));
  }

  /**
   * Сессия на сегодня: сначала слова с подошедшим сроком, затем новые —
   * по порядку параграфов, чтобы учебник проходился последовательно.
   */
  async forToday(size = 10): Promise<Question[]> {
    const context = await this.context();
    // Только перевод: записи артикля и форм глагола лежат в той же таблице,
    // и по общему ключу wordId они затирали друг друга — слово, у которого
    // тренировали лишь артикль, переставало считаться новым для перевода.
    const progress = await this.srs.byWord('translation');
    const now = Date.now();

    const due = context.pool
      .filter((word) => {
        const seen = progress.get(word.id);
        return seen && seen.dueAt <= now;
      })
      .sort((a, b) => progress.get(a.id)!.dueAt - progress.get(b.id)!.dueAt);

    const selected = due.slice(0, size);

    if (selected.length < size) {
      const fresh = context.pool.filter((word) => !progress.has(word.id));
      selected.push(...fresh.slice(0, size - selected.length));
    }

    return shuffle(selected).map((word) => this.buildQuestion(word, context));
  }

  /**
   * Режим de/het. Артикль в нидерландском не выводится из формы слова, его
   * можно только запомнить, поэтому он тренируется отдельно от перевода.
   */
  async forArticles(size = 10): Promise<Question[]> {
    const context = await this.context();
    const progress = await this.srs.byWord('article');
    const now = Date.now();

    const nouns = context.pool.filter(hasArticle);

    const due = nouns
      .filter((word) => {
        const seen = progress.get(word.id);
        return seen && seen.dueAt <= now;
      })
      .sort((a, b) => progress.get(a.id)!.dueAt - progress.get(b.id)!.dueAt);

    const selected = due.slice(0, size);
    if (selected.length < size) {
      const fresh = nouns.filter((word) => !progress.has(word.id));
      selected.push(...fresh.slice(0, size - selected.length));
    }

    return shuffle(selected).map((word) => this.buildArticleQuestion(word));
  }

  private buildArticleQuestion(word: Word): Question {
    // Порядок вариантов постоянный: de слева, het справа. Перемешивать нечего —
    // вариантов всего два, и стабильное место помогает отвечать быстрее.
    const options = ['de', 'het'];
    return {
      word,
      skill: 'article',
      prompt: word.nl,
      options,
      correctIndex: options.indexOf(word.article!),
      direction: 'nl-ru',
    };
  }

  /**
   * Формы неправильных глаголов. Спрашиваем прошедшее время и перфект целиком
   * («zijn gegaan»): выбор hebben/zijn — отдельная трудность, и разбирать его
   * в отрыве от причастия смысла нет.
   */
  async forVerbs(size = 10): Promise<Question[]> {
    const context = await this.context();
    const progress = await this.srs.byWord('verb');
    const now = Date.now();

    const verbs = context.pool.filter(isIrregularVerb);

    const due = verbs
      .filter((word) => {
        const seen = progress.get(word.id);
        return seen && seen.dueAt <= now;
      })
      .sort((a, b) => progress.get(a.id)!.dueAt - progress.get(b.id)!.dueAt);

    const selected = due.slice(0, size);
    if (selected.length < size) {
      const fresh = verbs.filter((word) => !progress.has(word.id));
      selected.push(...fresh.slice(0, size - selected.length));
    }

    return shuffle(selected)
      .map((word) => this.buildVerbQuestion(word, verbs))
      .filter((question): question is Question => question !== null);
  }

  /**
   * Правдоподобно неверные формы — те, которые получаются из реальных ошибок,
   * а не из случайного другого глагола.
   */
  private verbTraps(word: Word, askPast: boolean): string[] {
    const forms = word.verbForms;
    if (!forms) return [];

    const traps: string[] = [];

    if (askPast) {
      // Образовано по правилу вместо того, чтобы вспомнить исключение.
      traps.push(regularPast(word.nl));

      // Приставку забыли отделить: doorging вместо ging door.
      if (forms.separable && forms.past.endsWith(` ${forms.separable}`)) {
        const bare = forms.past.slice(0, -forms.separable.length - 1);
        traps.push(`${forms.separable}${bare}`);
      }
    } else {
      traps.push(`${forms.auxiliary ?? 'hebben'} ${regularParticiple(word.nl)}`);

      // Перепутан вспомогательный глагол — самая частая ошибка в перфекте.
      if (forms.auxiliary === 'hebben' || forms.auxiliary === 'zijn') {
        const flipped = forms.auxiliary === 'hebben' ? 'zijn' : 'hebben';
        traps.push(`${flipped} ${forms.participle}`);
      }
    }

    return traps;
  }

  private buildVerbQuestion(word: Word, verbs: Word[]): Question | null {
    const forms = word.verbForms;
    if (!forms) return null;

    // Половину вопросов про прошедшее, половину про перфект.
    const askPast = Math.random() < 0.5;
    const correct = askPast ? forms.past : perfectOf(word);
    if (!correct) return null;

    const answerOf = (w: Word) => (askPast ? w.verbForms?.past : perfectOf(w));

    const seen = new Set([correct]);
    const options: string[] = [];

    // Сначала ошибки, которые реально делают, и только потом чужие формы.
    for (const trap of this.verbTraps(word, askPast)) {
      if (options.length >= OPTIONS - 1) break;
      if (seen.has(trap)) continue;
      seen.add(trap);
      options.push(trap);
    }

    for (const candidate of shuffle(verbs)) {
      if (options.length >= OPTIONS - 1) break;
      if (candidate.id === word.id) continue;

      const option = answerOf(candidate);
      if (!option || seen.has(option)) continue;

      seen.add(option);
      options.push(option);
    }

    const all = shuffle([correct, ...options]);
    return {
      word,
      skill: 'verb',
      prompt: word.nl,
      subPrompt: askPast ? 'verleden tijd' : 'voltooide tijd',
      options: all,
      correctIndex: all.indexOf(correct),
      direction: 'nl-ru',
    };
  }

  /** Числа для главного экрана: по каждому навыку отдельно. */
  async counts(): Promise<{
    due: number;
    fresh: number;
    learned: number;
    articlesDue: number;
    articlesFresh: number;
    articlesLearned: number;
    verbsDue: number;
    verbsFresh: number;
    verbsLearned: number;
  }> {
    const [words, translation, article, verb] = await Promise.all([
      db.words.toArray(),
      this.srs.byWord('translation'),
      this.srs.byWord('article'),
      this.srs.byWord('verb'),
    ]);

    const learnable = words.filter(isLearnable);
    const now = Date.now();

    const tally = (list: Word[], progress: Map<string, { box: number; dueAt: number }>) => {
      let due = 0;
      let fresh = 0;
      let learned = 0;
      for (const word of list) {
        const seen = progress.get(word.id);
        if (!seen) fresh++;
        else if (seen.dueAt <= now) due++;
        if (seen && seen.box >= LEARNED_BOX) learned++;
      }
      return { due, fresh, learned };
    };

    const words_ = tally(learnable, translation);
    const articles = tally(learnable.filter(hasArticle), article);
    const verbs = tally(learnable.filter(isIrregularVerb), verb);

    return {
      ...words_,
      articlesDue: articles.due,
      articlesFresh: articles.fresh,
      articlesLearned: articles.learned,
      verbsDue: verbs.due,
      verbsFresh: verbs.fresh,
      verbsLearned: verbs.learned,
    };
  }

  private async context(): Promise<Context> {
    const [words, chapters] = await Promise.all([db.words.toArray(), this.chapters()]);

    const themeOf = new Map<string, number>();
    const chaptersOfTheme = new Map<number, Set<string>>();
    for (const chapter of chapters) {
      themeOf.set(chapter.id, chapter.theme);
      const set = chaptersOfTheme.get(chapter.theme) ?? new Set<string>();
      set.add(chapter.id);
      chaptersOfTheme.set(chapter.theme, set);
    }

    // Порядок параграфов задаёт порядок ввода новых слов.
    const order = new Map(chapters.map((chapter, i) => [chapter.id, i]));
    const pool = words
      .filter(isLearnable)
      .sort((a, b) => (order.get(a.chapterId) ?? 0) - (order.get(b.chapterId) ?? 0));

    return { pool, themeOf, chaptersOfTheme };
  }

  private chapters(): Promise<Chapter[]> {
    return db.chapters.orderBy('order').toArray();
  }

  private buildQuestion(word: Word, context: Context): Question {
    // Половина вопросов в обратную сторону: узнавать перевод легче, чем
    // вспоминать само слово, и без обратного направления слова не активируются.
    const direction: Direction = Math.random() < 0.5 ? 'nl-ru' : 'ru-nl';
    const answerOf = (w: Word) => (direction === 'nl-ru' ? w.ru : w.nl);

    const correct = answerOf(word);
    const distractors = this.pickDistractors(word, context, answerOf);
    const options = shuffle([correct, ...distractors]);

    return {
      word,
      skill: 'translation',
      prompt: direction === 'nl-ru' ? this.withArticle(word) : word.ru,
      options,
      correctIndex: options.indexOf(correct),
      direction,
    };
  }

  /**
   * Отвлекающие варианты берём как можно ближе к правильному: та же часть речи,
   * тот же параграф. Случайные слова из другой темы делают выбор очевидным —
   * тренировался бы не словарь, а умение исключать нелепое.
   */
  private pickDistractors(word: Word, context: Context, answerOf: (w: Word) => string): string[] {
    const correct = answerOf(word);
    const correctWords = significantWords(correct);
    const seen = new Set([correct]);
    const picked: string[] = [];

    const theme = context.themeOf.get(word.chapterId);
    const neighbours =
      (theme !== undefined && context.chaptersOfTheme.get(theme)) || new Set<string>();

    const tiers = [
      (w: Word) => w.chapterId === word.chapterId && w.pos === word.pos,
      (w: Word) => neighbours.has(w.chapterId) && w.pos === word.pos,
      (w: Word) => w.pos === word.pos,
      () => true,
    ];

    const collect = (matches: (w: Word) => boolean, avoidOverlap: boolean) => {
      for (const candidate of shuffle(context.pool)) {
        if (picked.length >= OPTIONS - 1) return;
        if (candidate.id === word.id || !matches(candidate)) continue;

        const option = answerOf(candidate);
        if (seen.has(option)) continue;

        // Вариант, делящий слово с правильным ответом, читается как второй
        // верный: «общий, всего» рядом с «всего лишь» сбивает с толку.
        if (avoidOverlap && overlaps(correctWords, significantWords(option))) continue;

        seen.add(option);
        picked.push(option);
      }
    };

    for (const matches of tiers) {
      if (picked.length >= OPTIONS - 1) break;
      collect(matches, true);
    }

    // Если из-за фильтра вариантов не хватило, добираем без него: показать
    // три варианта вместо четырёх хуже, чем показать похожий.
    if (picked.length < OPTIONS - 1) collect(() => true, false);

    return picked;
  }

  /** Существительное показываем с артиклем — он часть слова. */
  private withArticle(word: Word): string {
    return word.article ? `${word.article} ${word.nl}` : word.nl;
  }
}
