import type { Fragment } from './rows';
import type { Page } from './woordenlijst';

/**
 * Разбор справочника «Onregelmatige werkwoorden»: таблица в четыре колонки —
 * инфинитив, прошедшее ед., прошедшее мн., перфект. Отсюда берутся отделяемые
 * приставки, которых в словнике нет: 'aanbieden' -> 'bood aan' -> 'aan'.
 */

/** Границы колонок таблицы. */
const COLUMNS = [120, 250, 400];
/** Допуск при сборке строки таблицы. */
const ROW_TOLERANCE = 4;

const PERFECT = /^(hebben\s*\/\s*zijn|hebben|zijn)\s+(.+)$/;
/** Безличный глагол: vriezen -> 'het heeft gevroren'. */
const IMPERSONAL = /^het[ ]+(heeft|is)[ ]+(.+)$/;

export interface IrregularVerb {
  nl: string;
  past: string;
  pastPlural: string;
  participle?: string;
  auxiliary?: 'hebben' | 'zijn' | 'hebben/zijn';
  separable?: string;
  /** eruitzien не образует перфекта. */
  noPerfect?: boolean;
  /** Употребляется только с 'het'. */
  impersonal?: boolean;
}

function columnOf(x: number): number {
  const index = COLUMNS.findIndex((edge) => x < edge);
  return index === -1 ? 3 : index;
}

/**
 * Отделяемая приставка видна по форме прошедшего времени:
 * 'aanbieden' + 'bood aan' -> 'aan'.
 */
function separableOf(infinitive: string, past: string): string | undefined {
  const tail = past.split(' ').at(-1);
  if (!tail || tail === past) return undefined;
  return infinitive.startsWith(tail) ? tail : undefined;
}

export function parseIrregularVerbs(pages: Page[]): IrregularVerb[] {
  const verbs: IrregularVerb[] = [];

  for (const page of pages) {
    const items = [...page].sort((a, b) => b.y - a.y);

    const rows: { y: number; parts: Fragment[] }[] = [];
    for (const item of items) {
      const last = rows.at(-1);
      if (last && last.y - item.y <= ROW_TOLERANCE) last.parts.push(item);
      else rows.push({ y: item.y, parts: [item] });
    }

    for (const row of rows) {
      const cells = ['', '', '', ''];
      for (const part of row.parts.sort((a, b) => a.x - b.x)) {
        const column = columnOf(part.x);
        cells[column] = `${cells[column]} ${part.text}`.trim();
      }

      const [infinitive, past, pastPlural, perfect] = cells;
      // Вводный текст и шапка таблицы не заполняют все четыре колонки.
      if (!infinitive || !past || !pastPlural || !perfect) continue;
      // Инфинитив всегда одно слово: так отсеивается шапка и обрывки текста.
      if (infinitive === 'werkwoord' || infinitive.includes(' ')) continue;

      const verb: IrregularVerb = { nl: infinitive, past, pastPlural };

      if (perfect === '-') {
        verb.noPerfect = true;
      } else {
        const parsed = perfect.match(PERFECT);
        const impersonal = parsed ? null : perfect.match(IMPERSONAL);
        if (!parsed && !impersonal) continue;

        if (impersonal) {
          verb.impersonal = true;
          verb.auxiliary = impersonal[1] === 'heeft' ? 'hebben' : 'zijn';
          verb.participle = impersonal[2];
        } else if (parsed) {
          verb.auxiliary = parsed[1]
            .split('/')
            .map((p) => p.trim())
            .join('/') as IrregularVerb['auxiliary'];
          verb.participle = parsed[2];
        }
      }

      const separable = separableOf(infinitive, past);
      if (separable) verb.separable = separable;

      verbs.push(verb);
    }
  }

  return verbs.sort((a, b) => a.nl.localeCompare(b.nl, 'nl'));
}
