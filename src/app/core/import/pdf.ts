import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { Fragment } from './rows';
import type { Page } from './woordenlijst';

/**
 * Читает PDF прямо в браузере. Разбор идёт на устройстве: файл никуда не
 * отправляется, а приложение остаётся без бэкенда.
 */

// Воркер копируется в корень сборки (см. assets в angular.json). Путь строим
// от <base href>: Angular не умеет резолвить new URL() для файлов из
// node_modules, а без воркера pdf.js падает на первом же документе.
GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).toString();

/**
 * WebKit не даёт итерировать ReadableStream через for await, а pdf.js именно
 * так собирает текст страницы (getTextContent). Без этого импорт падал на
 * первой же странице: «a[Symbol.iterator] is not a function» — хелпер
 * for await не находит ни asyncIterator, ни iterator. В Chrome поддержка
 * есть, поэтому на десктопе проблема не воспроизводилась.
 */
function polyfillStreamIteration(): void {
  const proto = ReadableStream.prototype as ReadableStream<unknown> & {
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<unknown>;
  };
  if (proto[Symbol.asyncIterator]) return;

  proto[Symbol.asyncIterator] = function (this: ReadableStream<unknown>) {
    const reader = this.getReader();
    const iterator: AsyncIterableIterator<unknown> = {
      next: () => reader.read() as Promise<IteratorResult<unknown>>,
      async return(value?: unknown) {
        await reader.cancel();
        return { done: true, value } as IteratorResult<unknown>;
      },
      [Symbol.asyncIterator]() {
        return iterator;
      },
    };
    return iterator;
  };
}

polyfillStreamIteration();

export interface ReadProgress {
  page: number;
  total: number;
}

export async function readPdf(
  file: File,
  onProgress?: (progress: ReadProgress) => void,
): Promise<Page[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;

  const pages: Page[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    const fragments: Fragment[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const textItem = item as TextItem;
      const text = textItem.str.trim();
      if (!text) continue;

      const [, , , , x, y] = textItem.transform;
      fragments.push({ x, y, text, font: String(textItem.fontName) });
    }

    pages.push(fragments);
    onProgress?.({ page: n, total: doc.numPages });
  }

  return pages;
}

/** Что за файл нам дали: словник, справочник глаголов или что-то чужое. */
export type PdfKind = 'woordenlijst' | 'verbs' | 'unknown';

/**
 * Тип определяем по содержимому, а не по имени файла: люди переименовывают
 * загрузки, а перепутанный файл дал бы пустой импорт без объяснений.
 */
export function detectKind(pages: Page[]): PdfKind {
  const head = pages
    .slice(0, 2)
    .flat()
    .map((f) => f.text.toLowerCase())
    .join(' ');

  if (head.includes('onregelmatige werkwoorden')) return 'verbs';
  if (head.includes('woordenlijst')) return 'woordenlijst';
  return 'unknown';
}
