import { DOCUMENT, Service, inject } from '@angular/core';
import { db } from './db';
import type { Progress, Skill } from './models';

const FORMAT = 'woordjes-progress';
const VERSION = 1;

/**
 * Файл резервной копии. Слова в него не попадают: они лицензионные и
 * восстанавливаются импортом словника, а прогресс — единственное, чего
 * нельзя получить заново.
 */
export interface ProgressBackup {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  progress: Progress[];
}

export interface RestoreResult {
  /** Записей записано в базу. */
  applied: number;
  /** Пропущено: в базе уже лежит более свежая тренировка. */
  outdated: number;
}

export class BadBackupError extends Error {
  constructor() {
    super('Это не похоже на резервную копию Woordjes.');
  }
}

/**
 * Полный перечень навыков. Записан объектом, а не массивом: добавится
 * четвёртый навык — TypeScript потребует дописать его и сюда.
 */
const SKILLS: Record<Skill, true> = { translation: true, article: true, verb: true };

function isProgress(value: unknown): value is Progress {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['wordId'] === 'string' &&
    typeof row['skill'] === 'string' &&
    Object.hasOwn(SKILLS, row['skill']) &&
    typeof row['box'] === 'number' &&
    typeof row['dueAt'] === 'number' &&
    typeof row['correct'] === 'number' &&
    typeof row['wrong'] === 'number' &&
    typeof row['lastSeenAt'] === 'number'
  );
}

/** Разбирает и проверяет файл. Чужой JSON не должен молча стереть прогресс. */
export function parseBackup(text: string): ProgressBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BadBackupError();
  }

  if (typeof data !== 'object' || data === null) throw new BadBackupError();
  const file = data as Record<string, unknown>;
  if (file['format'] !== FORMAT) throw new BadBackupError();
  if (!Array.isArray(file['progress'])) throw new BadBackupError();

  const progress = file['progress'].filter(isProgress);
  return {
    format: FORMAT,
    version: typeof file['version'] === 'number' ? file['version'] : VERSION,
    exportedAt: typeof file['exportedAt'] === 'string' ? file['exportedAt'] : '',
    progress,
  };
}

/**
 * Сохранение и восстановление прогресса. Коробки Лейтнера живут только в
 * IndexedDB этого браузера: снести иконку с домашнего экрана — значит
 * потерять месяцы занятий, а у вкладки и установленного приложения
 * хранилища вдобавок разные.
 */
@Service()
export class Backup {
  private readonly document = inject(DOCUMENT);

  async collect(): Promise<ProgressBackup> {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      progress: await db.progress.toArray(),
    };
  }

  /**
   * Отдаёт файл пользователю. На телефоне это системный лист «Поделиться»
   * с пунктом «Сохранить в Файлы»; на десктопе — обычная загрузка.
   * Возвращает false, если человек закрыл лист, не выбрав ничего.
   */
  async save(): Promise<boolean> {
    const backup = await this.collect();
    const name = `woordjes-${backup.exportedAt.slice(0, 10)}.json`;
    const text = JSON.stringify(backup, null, 2);
    const file = new File([text], name, { type: 'application/json' });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Woordjes' });
        return true;
      } catch (cause) {
        // Отмена — не ошибка: человек передумал, а не сломал.
        if (cause instanceof DOMException && cause.name === 'AbortError') return false;
        throw cause;
      }
    }

    const url = URL.createObjectURL(file);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  }

  /**
   * Сливает копию с тем, что уже есть. Побеждает более свежая тренировка:
   * файл может быть старше текущих занятий, и затирать ими живой прогресс
   * нельзя. Записи для ещё не импортированных слов сохраняются тоже —
   * словник могут загрузить следом.
   */
  async restore(file: File): Promise<RestoreResult> {
    const backup = parseBackup(await file.text());
    if (backup.progress.length === 0) throw new BadBackupError();

    let applied = 0;
    let outdated = 0;

    await db.transaction('rw', db.progress, async () => {
      for (const row of backup.progress) {
        const current = await db.progress.get([row.wordId, row.skill]);
        if (current && current.lastSeenAt >= row.lastSeenAt) {
          outdated++;
          continue;
        }
        await db.progress.put(row);
        applied++;
      }
    });

    return { applied, outdated };
  }
}
