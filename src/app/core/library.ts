import { DOCUMENT, Service, inject, signal } from '@angular/core';
import { db } from './db';
import type { ReadProgress } from './import/pdf';
import type { IrregularVerb } from './import/verb-list';
import type { Page } from './import/woordenlijst';
import type { Chapter, Word, WordSource } from './models';
import { isLearnable } from './srs';

/** Ручные дополнения: примеры и ударения, которых нет в словнике издателя. */
type Overrides = Record<string, Partial<Word> & { titleRu?: string }>;

export interface ImportResult {
  kind: 'woordenlijst' | 'verbs';
  chapters?: number;
  words?: number;
  verbs?: number;
  /** Записи, которые не удалось разобрать. */
  skipped?: number;
}

export class WrongFileError extends Error {
  constructor() {
    super(
      'Это не похоже на словник TaalCompleet. Нужен Woordenlijst или Onregelmatige werkwoorden.',
    );
  }
}

function slug(nl: string): string {
  return nl
    .toLowerCase()
    .replace(/^(de|het|een)\s+/, '')
    .replace(/[^a-zà-ÿ0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Словарь пользователя. Данные не поставляются с приложением: каждый
 * импортирует свой файл из личного кабинета, поэтому здесь только механика.
 */
@Service()
export class Library {
  private readonly document = inject(DOCUMENT);

  /** Сколько параграфов уже загружено — экраны ориентируются на это. */
  readonly chapterCount = signal(0);

  async refresh(): Promise<void> {
    this.chapterCount.set(await db.chapters.count());
  }

  async importPdf(file: File, onProgress?: (p: ReadProgress) => void): Promise<ImportResult> {
    // pdfjs весит больше самого приложения и нужен только здесь.
    const { readPdf, detectKind } = await import('./import/pdf');

    const pages = await readPdf(file, onProgress);
    const kind = detectKind(pages);

    if (kind === 'verbs') return this.importVerbs(pages);
    if (kind === 'woordenlijst') return this.importWoordenlijst(pages);
    throw new WrongFileError();
  }

  private async importWoordenlijst(pages: Page[]) {
    const { parseWoordenlijst } = await import('./import/woordenlijst');
    const { chapters: parsed, skipped } = parseWoordenlijst(pages);
    if (parsed.length === 0) throw new WrongFileError();

    const overrides = await this.loadOverrides();
    const verbs = new Map((await db.verbs.toArray()).map((v) => [v.nl, v]));

    const chapters: Chapter[] = [];
    const words: Word[] = [];

    for (const source of parsed) {
      const chapterPatch = overrides[source.id];
      const titleRu = chapterPatch?.titleRu ?? source.titleRu;

      const chapterWords = source.words.map((item) =>
        this.buildWord(item, source.id, overrides, verbs),
      );
      words.push(...chapterWords);

      chapters.push({
        id: source.id,
        title: source.title,
        titleRu,
        theme: source.theme,
        themeTitle: source.themeTitle,
        level: source.level,
        order: source.order,
        // Грамматические термины в счёт не идут: у почти половины параграфов
        // учебника других слов и нет, а «0 / 8» в списке обещало бы тренировку,
        // которой там не будет.
        wordCount: chapterWords.filter(isLearnable).length,
      });
    }

    await db.transaction('rw', db.chapters, db.words, async () => {
      await db.chapters.clear();
      await db.words.clear();
      await db.chapters.bulkPut(chapters);
      await db.words.bulkPut(words);
    });

    await this.refresh();
    return {
      kind: 'woordenlijst' as const,
      chapters: chapters.length,
      words: words.length,
      skipped,
    };
  }

  private async importVerbs(pages: Page[]) {
    const { parseIrregularVerbs } = await import('./import/verb-list');
    const verbs = parseIrregularVerbs(pages);
    if (verbs.length === 0) throw new WrongFileError();

    await db.transaction('rw', db.verbs, async () => {
      await db.verbs.clear();
      await db.verbs.bulkPut(verbs);
    });

    // Словарь мог быть загружен раньше: дополняем уже сохранённые слова.
    await this.enrichExistingWords(verbs);
    return { kind: 'verbs' as const, verbs: verbs.length };
  }

  /** Проставляет отделяемые приставки и метку исключения уже сохранённым словам. */
  private async enrichExistingWords(verbs: IrregularVerb[]): Promise<void> {
    const byNl = new Map(verbs.map((v) => [v.nl, v]));
    const words = await db.words.toArray();
    const updated: Word[] = [];

    for (const word of words) {
      const verb = byNl.get(word.nl);
      if (!verb) continue;

      const tags = [...new Set([...(word.tags ?? []), 'onregelmatig'])];
      const next: Word = { ...word, tags };
      // Вспомогательный глагол из словника точнее: он дан для контекста параграфа.
      if (verb.separable && next.verbForms) {
        next.verbForms = { ...next.verbForms, separable: verb.separable };
      }
      updated.push(next);
    }

    if (updated.length) await db.words.bulkPut(updated);
  }

  private buildWord(
    source: WordSource,
    chapterId: string,
    overrides: Overrides,
    verbs: Map<string, IrregularVerb>,
  ): Word {
    const word: Word = { ...source, id: `${chapterId}:${slug(source.nl)}`, chapterId };

    const verb = verbs.get(word.nl);
    if (verb) {
      word.tags = [...new Set([...(word.tags ?? []), 'onregelmatig'])];
      if (verb.separable && word.verbForms) {
        word.verbForms = { ...word.verbForms, separable: verb.separable };
      }
    }

    const patch = overrides[`${chapterId}:${source.nl}`];
    if (patch) {
      const tags = [...new Set([...(word.tags ?? []), ...(patch.tags ?? [])])];
      Object.assign(word, patch);
      if (tags.length) word.tags = tags;
    }

    return word;
  }

  /**
   * Ручной слой поставляется с приложением: это не материал издателя,
   * а собственные примеры и ударения.
   */
  private async loadOverrides(): Promise<Overrides> {
    try {
      const url = new URL('overrides.json', this.document.baseURI);
      const response = await fetch(url);
      if (!response.ok) return {};
      return (await response.json()) as Overrides;
    } catch {
      return {};
    }
  }
}
