import { TestBed } from '@angular/core/testing';
import { BadBackupError, Backup, parseBackup } from './backup';
import { db } from './db';
import type { Progress } from './models';

function progress(wordId: string, patch: Partial<Progress> = {}): Progress {
  return {
    wordId,
    skill: 'translation',
    box: 3,
    dueAt: 1_000,
    correct: 5,
    wrong: 1,
    lastSeenAt: 1_000,
    ...patch,
  };
}

function asFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' });
}

describe('Backup', () => {
  let backup: Backup;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    backup = TestBed.inject(Backup);
  });

  it('собирает весь прогресс и помечает копию датой', async () => {
    await db.progress.bulkPut([progress('1.1:buren'), progress('1.1:hamer', { skill: 'article' })]);

    const collected = await backup.collect();

    expect(collected.format).toBe('woordjes-progress');
    expect(collected.progress).toHaveLength(2);
    expect(Date.parse(collected.exportedAt)).not.toBeNaN();
  });

  it('восстанавливает записи, которых в базе нет', async () => {
    const file = asFile(await backup.collect().then((b) => ({ ...b, progress: [progress('1.1:buren')] })));

    const result = await backup.restore(file);

    expect(result.applied).toBe(1);
    expect((await db.progress.get(['1.1:buren', 'translation']))?.box).toBe(3);
  });

  it('не затирает более свежую тренировку старой копией', async () => {
    await db.progress.put(progress('1.1:buren', { box: 5, lastSeenAt: 9_000 }));
    const stale = await backup.collect().then((b) => ({
      ...b,
      progress: [progress('1.1:buren', { box: 1, lastSeenAt: 2_000 })],
    }));

    const result = await backup.restore(asFile(stale));

    expect(result.outdated).toBe(1);
    expect(result.applied).toBe(0);
    // Занятия после экспорта важнее файла: иначе копия откатывала бы прогресс.
    expect((await db.progress.get(['1.1:buren', 'translation']))?.box).toBe(5);
  });

  it('перезаписывает запись, если в копии тренировка новее', async () => {
    await db.progress.put(progress('1.1:buren', { box: 1, lastSeenAt: 2_000 }));
    const fresh = await backup.collect().then((b) => ({
      ...b,
      progress: [progress('1.1:buren', { box: 4, lastSeenAt: 9_000 })],
    }));

    const result = await backup.restore(asFile(fresh));

    expect(result.applied).toBe(1);
    expect((await db.progress.get(['1.1:buren', 'translation']))?.box).toBe(4);
  });

  it('различает навыки одного слова', async () => {
    const both = await backup.collect().then((b) => ({
      ...b,
      progress: [
        progress('1.1:buren', { skill: 'translation', box: 2 }),
        progress('1.1:buren', { skill: 'article', box: 5 }),
      ],
    }));

    await backup.restore(asFile(both));

    expect((await db.progress.get(['1.1:buren', 'translation']))?.box).toBe(2);
    expect((await db.progress.get(['1.1:buren', 'article']))?.box).toBe(5);
  });

  it('отвергает чужой JSON, не трогая базу', async () => {
    await db.progress.put(progress('1.1:buren', { box: 5 }));

    await expect(backup.restore(asFile({ hello: 'world' }))).rejects.toBeInstanceOf(BadBackupError);
    expect((await db.progress.get(['1.1:buren', 'translation']))?.box).toBe(5);
  });

  it('отбрасывает битые записи, сохраняя целые', () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: 'woordjes-progress',
        version: 1,
        progress: [progress('1.1:buren'), { wordId: '1.1:hamer' }, { skill: 'wrong' }],
      }),
    );

    expect(parsed.progress).toHaveLength(1);
    expect(parsed.progress[0].wordId).toBe('1.1:buren');
  });
});
