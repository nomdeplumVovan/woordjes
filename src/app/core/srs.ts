import { Service } from '@angular/core';
import { db } from './db';
import type { Progress, Skill, Word } from './models';

/**
 * Интервалы коробок Лейтнера в днях. Индекс — номер коробки, нулевая не
 * используется: слово, на котором ошиблись, падает в первую, а не в никуда.
 */
const INTERVALS_DAYS = [0, 1, 2, 4, 8, 16];
const MAX_BOX = 5;
/** С этой коробки слово считается выученным. */
export const LEARNED_BOX = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Грамматические термины из словника («Dit woord hoef je niet te leren») не тренируем. */
export function isLearnable(word: Word): boolean {
  return !word.tags?.includes('niet leren');
}

/** Артикль тренируется только у существительных, у которых он вообще есть. */
export function hasArticle(word: Word): boolean {
  return word.pos === 'noun' && (word.article === 'de' || word.article === 'het');
}

@Service()
export class Srs {
  /**
   * Записывает ответ. Угадал — слово поднимается на коробку выше и всплывёт
   * нескоро; ошибся — падает в первую и вернётся завтра.
   */
  async answer(wordId: string, skill: Skill, correct: boolean): Promise<Progress> {
    const now = Date.now();
    const current = await db.progress.get([wordId, skill]);

    const box = correct ? Math.min((current?.box ?? 0) + 1, MAX_BOX) : 1;
    const next: Progress = {
      wordId,
      skill,
      box,
      dueAt: now + INTERVALS_DAYS[box] * DAY_MS,
      correct: (current?.correct ?? 0) + (correct ? 1 : 0),
      wrong: (current?.wrong ?? 0) + (correct ? 0 : 1),
      lastSeenAt: now,
    };

    await db.progress.put(next);
    return next;
  }

  /** Записи прогресса по навыку, разложенные по слову. */
  async byWord(skill: Skill): Promise<Map<string, Progress>> {
    const rows = await db.progress.where('skill').equals(skill).toArray();
    return new Map(rows.map((row) => [row.wordId, row]));
  }
}
