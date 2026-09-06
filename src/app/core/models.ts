/** Часть речи. Определяет, какие игровые режимы применимы к слову. */
export type PartOfSpeech = 'noun' | 'verb' | 'adj' | 'adv' | 'phrase' | 'other';

/** Определённый артикль. Отдельный режим тренировки — самая частая ошибка в нидерландском. */
export type Article = 'de' | 'het';

export interface VerbForms {
  /** Простое прошедшее, ед. число: werken -> werkte, bevallen -> beviel */
  past: string;
  /** Прошедшее, мн. число, если отличается не только окончанием: beviel -> bevielen */
  pastPlural?: string;
  /** Причастие прошедшего времени: werken -> gewerkt */
  participle: string;
  /**
   * Вспомогательный глагол перфекта: 'hebben geleend', но 'zijn geworden'.
   * У части глаголов допустимы оба (breken: hebben / zijn gebroken).
   * Выбор между hebben и zijn — отдельная тема и отдельный режим тренировки.
   */
  auxiliary?: 'hebben' | 'zijn' | 'hebben/zijn';
  /**
   * Отделяемая приставка: opbellen -> 'op' ("ik bel je op").
   * Меняет порядок слов в предложении, поэтому нужна отдельно.
   */
  separable?: string;
}

export interface Example {
  nl: string;
  ru: string;
}

/** Разбивка на слоги с ударением — упражнения вида "Waar ligt de klemtoon?". */
export interface Stress {
  /** ['zwan', 'ger'] */
  syllables: string[];
  /** Индекс ударного слога: для 'zwan-ger' это 0, для 'suc-ces' — 1. */
  index: number;
}

export interface Word {
  /** `${chapterId}:${slug}` — стабилен, пока слово не переименовано. */
  id: string;
  /** Слово без артикля: 'naam', 'werken'. */
  nl: string;
  ru: string;
  article?: Article;
  plural?: string;
  /** Склоняемая форма прилагательного: blij -> blije. */
  inflected?: string;
  pos: PartOfSpeech;
  verbForms?: VerbForms;
  stress?: Stress;
  example?: Example;
  chapterId: string;
  tags?: string[];
}

/** Параграф учебника: 1.1, 1.2, ... Внутри темы. */
export interface Chapter {
  /** Номер параграфа как в книге: '1.1'. */
  id: string;
  /** Нидерландское название параграфа: 'Nieuwe buren'. */
  title: string;
  titleRu: string;
  /** Номер темы: 1..8 */
  theme: number;
  /** Название темы: 'Verhuizen'. */
  themeTitle: string;
  level: string;
  order: number;
  wordCount: number;
}

/** Слово в JSON-файле параграфа: без id и chapterId — они выводятся при импорте. */
export type WordSource = Omit<Word, 'id' | 'chapterId'>;

/** Формат файла public/data/<id>.json */
export interface ChapterSource {
  id: string;
  title: string;
  titleRu: string;
  theme: number;
  themeTitle: string;
  level: string;
  order: number;
  words: WordSource[];
}

/**
 * Что именно тренируется. Навыки независимы: знать перевод «buren» и помнить,
 * что это «de buren», — разные умения, и забываются они врозь.
 */
export type Skill = 'translation' | 'article' | 'verb';

/**
 * Прогресс живёт отдельно от слов: словари пересобираются при каждом старте,
 * прогресс переживает это. Ключ — пара слово + навык.
 */
export interface Progress {
  wordId: string;
  skill: Skill;
  /** Коробка Лейтнера 1..5. */
  box: number;
  /** Когда слово снова всплывёт, epoch ms. */
  dueAt: number;
  correct: number;
  wrong: number;
  lastSeenAt: number;
}
