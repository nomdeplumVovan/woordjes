import Dexie from 'dexie';

/**
 * База в том виде, в каком её оставляли сборки до первого коммита: первичный
 * ключ прогресса — `wordId`, без навыка. Такие базы живут только в дев-профилях
 * браузера, но открываться приложение на них обязано: сменить первичный ключ
 * на месте IndexedDB не умеет, и без правильной цепочки версий Dexie падает
 * с `UpgradeError`, то есть приложение не стартует вообще.
 */
async function seedLegacy(): Promise<void> {
  const legacy = new Dexie('woordjes');
  legacy.version(1).stores({
    words: 'id, chapterId, pos, article',
    chapters: 'id, order',
    progress: 'wordId, box, dueAt',
  });
  legacy.version(2).stores({ meta: 'key' });

  await legacy.open();
  await legacy.table('progress').put({
    wordId: '1.1:buren',
    box: 3,
    dueAt: 1_000,
    correct: 5,
    wrong: 1,
    lastSeenAt: 1_000,
  });
  legacy.close();
}

/**
 * База выпущенной сборки: прогресс уже с составным ключом, справочник глаголов
 * на месте. Такая база у каждого, кто пользуется приложением, и переезд на
 * новую цепочку версий не имеет права её тронуть.
 */
async function seedCurrent(): Promise<void> {
  const shipped = new Dexie('woordjes');
  shipped.version(1).stores({
    words: 'id, chapterId, pos, article',
    chapters: 'id, order',
    progress: 'wordId, box, dueAt',
  });
  shipped.version(2).stores({ meta: 'key' });
  shipped.version(3).stores({ progress: '[wordId+skill], box, dueAt, wordId, skill' });
  shipped.version(4).stores({ verbs: 'nl' });

  await shipped.open();
  await shipped.table('progress').put({
    wordId: '1.1:buren',
    skill: 'translation',
    box: 4,
    dueAt: 2_000,
    correct: 7,
    wrong: 2,
    lastSeenAt: 2_000,
  });
  await shipped.table('verbs').put({ nl: 'gaan', past: 'ging', participle: 'gegaan' });
  shipped.close();
}

describe('переезд схемы базы', () => {
  beforeEach(async () => {
    await Dexie.delete('woordjes');
    // core/db отдаёт singleton, и однажды не открывшийся экземпляр остаётся
    // сломанным. Каждому тесту нужен свой, иначе они видят чужой отказ.
    vi.resetModules();
  });

  it('открывается на базе, оставшейся от сборок с ключом без навыка', async () => {
    await seedLegacy();

    const { db } = await import('./db');
    // Здесь и падало: «Not yet support for changing primary key».
    await expect(db.open()).resolves.toBeDefined();

    // Ключ стал составным — запись с навыком читается и пишется.
    await db.progress.put({
      wordId: '1.1:hamer',
      skill: 'article',
      box: 1,
      dueAt: 5_000,
      correct: 0,
      wrong: 1,
      lastSeenAt: 5_000,
    });
    expect(await db.progress.get(['1.1:hamer', 'article'])).toBeDefined();
    db.close();
  });

  it('не теряет прогресс и глаголы из базы выпущенной сборки', async () => {
    await seedCurrent();

    const { db } = await import('./db');
    await db.open();

    const saved = await db.progress.get(['1.1:buren', 'translation']);
    expect(saved?.box).toBe(4);
    expect(saved?.correct).toBe(7);
    expect(await db.verbs.get('gaan')).toBeDefined();
    db.close();
  });
});
