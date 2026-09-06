import type { Chapter, Word, WordSource } from '../models';
import { CHAPTER, THEME, type Entry, type Fragment, parsePage } from './rows';

/** Страница PDF, приведённая к набору текстовых фрагментов. */
export type Page = Fragment[];

export interface ParsedChapter extends Omit<Chapter, 'wordCount'> {
  words: WordSource[];
}

export interface ParseResult {
  chapters: ParsedChapter[];
  /** Записи, которые разобрать не удалось: сигнал, что файл не тот. */
  skipped: number;
}

/**
 * Разбиение по запятым верхнего уровня: запятая внутри скобок разделителем
 * не считается. Иначе «zachter (zacht, zachte)» рвётся посередине справки,
 * а «beviel(en)» и так остаётся цел.
 */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());

  return parts.filter(Boolean);
}

/**
 * Грамматическая справка в скобках: «Hoe ziet … eruit? (eruitzien, zag(en)
 * eruit, hebben eruitgezien)». Выражение стоит перед скобкой, формы внутри.
 */
function splitGrammarNote(nl: string): { head: string; forms: string } {
  const match = nl.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (!match) return { head: nl, forms: nl };

  const [, head, inside] = match;
  const looksLikeForms = inside.includes(',') && /\b(hebben|zijn)\b/.test(inside);
  return looksLikeForms ? { head, forms: inside } : { head: nl, forms: nl };
}

/** 'bevallen, beviel(en), zijn bevallen' -> формы глагола. */
function parseVerb(parts: string[]): Partial<Word> | null {
  const [infinitive, pastRaw, perfectRaw] = parts;
  if (!pastRaw || !perfectRaw) return null;

  const perfect = perfectRaw.match(/^(hebben\s*\/\s*zijn|hebben|zijn)\s+(.+)$/);
  if (!perfect) return null;

  // Скобки задают множественное число и могут стоять в середине:
  // 'beviel(en)' -> bevielen, 'had(den) geluk' -> hadden geluk.
  const past = pastRaw.match(/^(.+?)\(([a-z]+)\)(.*)$/);
  const auxiliary = perfect[1]
    .split('/')
    .map((p) => p.trim())
    .join('/') as NonNullable<Word['verbForms']>['auxiliary'];

  const forms: NonNullable<Word['verbForms']> = {
    past: past ? past[1] + past[3] : pastRaw,
    participle: perfect[2],
    auxiliary,
  };
  if (past) forms.pastPlural = past[1] + past[2] + past[3];

  return { nl: infinitive, verbForms: forms };
}

/** 'de hamer, de hamers' -> существительное с артиклем и множественным числом. */
function parseNoun(parts: string[]): Partial<Word> | null {
  const head = parts[0].match(/^(de|het)\s+(.+)$/);
  if (!head) return null;

  const word: Partial<Word> = { nl: head[2], article: head[1] as 'de' | 'het' };
  if (parts[1]) word.plural = parts[1].replace(/^(de|het)\s+/, '');
  return word;
}

/** 'blij, blije' -> прилагательное со склоняемой формой. */
function parseAdjective(parts: string[]): Partial<Word> | null {
  if (parts.length !== 2) return null;
  const [base, inflected] = parts;
  if (!inflected.startsWith(base) || inflected === base) return null;
  return { nl: base, inflected };
}

function parseWord(nlRaw: string, ru: string): WordSource {
  const notForLearning = nlRaw.includes('*');
  const nl = nlRaw.replace(/\s*\*/g, '').trim();
  const { head, forms } = splitGrammarNote(nl);
  const parts = splitTopLevel(forms);

  const verb = parseVerb(parts);
  const noun = verb ? null : parseNoun(parts);
  const adjective = verb || noun ? null : parseAdjective(parts);
  const base = verb ?? noun ?? adjective ?? { nl: parts[0] ?? nl };
  const baseNl = base.nl ?? nl;

  // Запись со скобочной справкой — это выражение целиком («Ik ben het zat.»),
  // и разбирать его как существительное нельзя: артикль внутри справки не имеет
  // отношения к самой записи.
  const isExpression = head !== nl;

  const pos: Word['pos'] = verb
    ? 'verb'
    : isExpression
      ? 'phrase'
      : noun
        ? 'noun'
        : adjective
          ? 'adj'
          : baseNl.includes(' ')
            ? 'phrase'
            : 'other';

  const word: WordSource = { nl: isExpression ? head : baseNl, ru, pos };
  if (base.article && !isExpression) word.article = base.article;
  if (base.plural && !isExpression) word.plural = base.plural;
  if (base.inflected && !isExpression) word.inflected = base.inflected;
  if (base.verbForms) word.verbForms = base.verbForms;
  if (notForLearning) word.tags = ['niet leren'];

  return word;
}

/**
 * Длинная запись переносится на две строки, и перенос бывает сразу в обеих
 * колонках — тогда у каждой половины есть своя пара и склейка сирот не
 * срабатывает. Признак обрыва: запись кончается вспомогательным глаголом
 * без причастия или запятой.
 */
function mergeContinuations(entries: Entry[]): Entry[] {
  const merged: Entry[] = [];

  for (const entry of entries) {
    const previous = merged.at(-1);
    const unfinished =
      previous &&
      !previous.heading &&
      !entry.heading &&
      (previous.nl.endsWith(',') ||
        (previous.nl.includes(',') && /\s(hebben|zijn|hebben\/zijn)$/.test(previous.nl)));

    if (previous && unfinished) {
      previous.nl = `${previous.nl} ${entry.nl}`.replace(/,\s*$/, '').trim();
      previous.ru = [previous.ru, entry.ru].filter(Boolean).join(' ').trim();
      continue;
    }

    merged.push({ ...entry });
  }

  return merged;
}

/** Собирает параграфы из прочитанных страниц PDF. */
export function parseWoordenlijst(pages: Page[]): ParseResult {
  const chapters: ParsedChapter[] = [];
  let theme: { number: number; title: string } | null = null;
  let current: ParsedChapter | null = null;
  let skipped = 0;

  for (const page of pages) {
    for (const entry of mergeContinuations(parsePage(page))) {
      if (entry.heading) {
        const themeHead = entry.heading.match(THEME);
        if (themeHead) {
          theme = { number: Number(themeHead[1]), title: themeHead[2].trim() };
          continue;
        }

        const chapterHead = entry.heading.match(CHAPTER);
        if (!chapterHead) {
          // Длинное название параграфа переносится на вторую строку.
          if (current && current.words.length === 0) {
            current.title = [current.title, entry.heading]
              .join(' ')
              .split(' ')
              .filter(Boolean)
              .join(' ');
          }
          continue;
        }

        const [, themeNo, paragraph, title] = chapterHead;
        current = {
          id: `${themeNo}.${paragraph}`,
          title: title.trim(),
          titleRu: '',
          theme: Number(themeNo),
          themeTitle: theme?.title ?? '',
          level: 'A2',
          // 1.1 -> 101, 1.15 -> 115: строковая сортировка ставила бы 1.10 перед 1.2.
          order: Number(themeNo) * 100 + Number(paragraph),
          words: [],
        };
        chapters.push(current);
        continue;
      }

      // Перевод, перенесённый на следующую строку, приходит без пары.
      if (!entry.nl && entry.ru && current?.words.length) {
        const previous = current.words.at(-1);
        if (previous) previous.ru = `${previous.ru} ${entry.ru}`.replace(/\s+/g, ' ').trim();
        continue;
      }

      if (!entry.nl || !entry.ru || !current) {
        if (entry.nl || entry.ru) skipped++;
        continue;
      }

      current.words.push(parseWord(entry.nl, entry.ru));
    }
  }

  return { chapters: chapters.filter((c) => c.words.length > 0), skipped };
}
