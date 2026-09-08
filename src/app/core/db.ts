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
    // поэтому ключ стал составным. Сменить первичный ключ на месте IndexedDB
    // не умеет — Dexie отвечает «Not yet support for changing primary key», и
    // приложение не стартует вообще. Поэтому таблица удаляется здесь и
    // создаётся заново следующей версией: это единственный законный путь.
    //
    // Записи старой таблицы при этом не спасаются, и это осознанно. Полная
    // цепочка версий появилась первым же коммитом, так что базу с ключом
    // `wordId` могли создать только сборки до него, то есть дев-профили
    // браузера. У выпущенных сборок прогресс лежит с составным ключом с самого
    // начала, и этих двух версий их база не касается.
    this.version(3).stores({ progress: null });
    // Справочник неправильных глаголов пользователь тоже импортирует сам. Он
    // остаётся на четвёртой версии, где и появился: перенумеруй его на пятую —
    // и Dexie, приводя базу к схеме четвёртой, сначала снесёт таблицу, а потом
    // создаст пустой. Прогресс пересоздаётся здесь же, парой к удалению выше.
    this.version(4).stores({
      progress: '[wordId+skill], box, dueAt, wordId, skill',
      verbs: 'nl',
    });
  }
}

export const db = new WoordjesDb();
