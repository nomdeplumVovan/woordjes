import Dexie, { type Table } from 'dexie';
import type { Chapter, Progress, Word } from './models';
import type { IrregularVerb } from './import/verb-list';

/** Служебная запись: ревизия словарей и прочие мелочи. */
export interface Meta {
  key: string;
  value: string;
}

/**
 * Локальная база. Никакого бэкенда: приложение целиком работает офлайн,
 * персональные данные никуда не уезжают.
 */
class WoordjesDb extends Dexie {
  words!: Table<Word, string>;
  chapters!: Table<Chapter, string>;
  progress!: Table<Progress, [string, string]>;
  meta!: Table<Meta, string>;
  verbs!: Table<IrregularVerb, string>;

  constructor() {
    super('woordjes');
    this.version(1).stores({
      words: 'id, chapterId, pos, article',
      chapters: 'id, order',
      progress: 'wordId, box, dueAt',
    });
    // Ревизия словарей, чтобы не пересобирать базу на каждом старте.
    this.version(2).stores({ meta: 'key' });
    // Прогресс разделён по навыкам: перевод и артикль забываются врозь,
    // поэтому ключ стал составным.
    this.version(3)
      .stores({ progress: '[wordId+skill], box, dueAt, wordId, skill' })
      .upgrade((tx) =>
        tx
          .table('progress')
          .toCollection()
          .modify((row) => {
            row.skill ??= 'translation';
          }),
      );

    // Справочник неправильных глаголов пользователь тоже импортирует сам.
    this.version(4).stores({ verbs: 'nl' });
  }
}

export const db = new WoordjesDb();
