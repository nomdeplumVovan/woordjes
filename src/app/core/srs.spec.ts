import { TestBed } from '@angular/core/testing';
import { db } from './db';
import { Srs } from './srs';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Srs', () => {
  let srs: Srs;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    srs = TestBed.inject(Srs);
  });

  it('поднимает слово на коробку выше при верном ответе', async () => {
    const first = await srs.answer('1.1:buren', 'translation', true);
    expect(first.box).toBe(1);
    expect(first.correct).toBe(1);

    const second = await srs.answer('1.1:buren', 'translation', true);
    expect(second.box).toBe(2);
    expect(second.dueAt).toBeGreaterThan(Date.now() + DAY_MS);
  });

  it('роняет слово в первую коробку при ошибке, а не обнуляет', async () => {
    await srs.answer('1.1:hamer', 'translation', true);
    await srs.answer('1.1:hamer', 'translation', true);
    await srs.answer('1.1:hamer', 'translation', true);

    const failed = await srs.answer('1.1:hamer', 'translation', false);
    expect(failed.box).toBe(1);
    expect(failed.wrong).toBe(1);
    // История ответов сохраняется — она пригодится для статистики.
    expect(failed.correct).toBe(3);
  });

  it('не поднимает выше пятой коробки', async () => {
    for (let i = 0; i < 8; i++) await srs.answer('1.1:succes', 'translation', true);
    const progress = await db.progress.get(['1.1:succes', 'translation']);
    expect(progress?.box).toBe(5);
  });

  it('хранит прогресс навыков раздельно', async () => {
    await srs.answer('1.1:buren', 'translation', true);
    await srs.answer('1.1:buren', 'translation', true);
    await srs.answer('1.1:buren', 'article', false);

    const translation = await srs.byWord('translation');
    const article = await srs.byWord('article');

    // Перевод выучен на две коробки, артикль при этом провален — они не мешают друг другу.
    expect(translation.get('1.1:buren')?.box).toBe(2);
    expect(article.get('1.1:buren')?.box).toBe(1);
  });

  it('возвращает слова, которые пора повторить', async () => {
    await srs.answer('1.1:a', 'translation', true);
    await db.progress.put({
      wordId: '1.1:old',
      skill: 'translation',
      box: 2,
      dueAt: Date.now() - DAY_MS,
      correct: 1,
      wrong: 0,
      lastSeenAt: Date.now() - 3 * DAY_MS,
    });

    const progress = await srs.byWord('translation');
    const overdue = [...progress.values()].filter((p) => p.dueAt <= Date.now());
    expect(overdue.map((p) => p.wordId)).toContain('1.1:old');
    expect(overdue.map((p) => p.wordId)).not.toContain('1.1:a');
  });
});
