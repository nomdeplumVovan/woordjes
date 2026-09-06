import { existsSync, readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { Page } from './woordenlijst';
import { parseWoordenlijst } from './woordenlijst';
import { parseIrregularVerbs } from './verb-list';

/**
 * Проверка парсера на настоящем файле издателя. Файл лицензионный и в
 * репозитории не лежит, поэтому тест пропускается, если его нет.
 */
const WOORDENLIJST = 'tools/source/TCA2_th1-8_woordenlijst_russ.pdf';
const VERBS = 'tools/source/A2_onregelmatige werkwoorden.pdf';

async function readPages(path: string): Promise<Page[]> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;

  const pages: Page[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    pages.push(
      content.items
        .filter((item): item is typeof item & { str: string } => 'str' in item)
        .map((item) => {
          const [, , , , x, y] = (item as unknown as { transform: number[] }).transform;
          return {
            x,
            y,
            text: item.str.trim(),
            font: String((item as unknown as { fontName: string }).fontName),
          };
        })
        .filter((f) => f.text),
    );
  }
  return pages;
}

describe.skipIf(!existsSync(WOORDENLIJST))('разбор словника издателя', () => {
  let result: ReturnType<typeof parseWoordenlijst>;

  beforeAll(async () => {
    result = parseWoordenlijst(await readPages(WOORDENLIJST));
  }, 120_000);

  it('находит все восемь тем', () => {
    const themes = new Set(result.chapters.map((c) => c.theme));
    expect([...themes].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('разбирает словарь без потерь', () => {
    const words = result.chapters.reduce((sum, c) => sum + c.words.length, 0);
    expect(result.chapters.length).toBeGreaterThan(100);
    expect(words).toBeGreaterThan(900);
    // Каждая непонятая строка — это потерянное слово.
    expect(result.skipped).toBe(0);
  });

  it('разбирает формы глагола вместе со вспомогательным', () => {
    const chapter = result.chapters.find((c) => c.id === '1.1');
    const bevallen = chapter?.words.find((w) => w.nl === 'bevallen');

    expect(bevallen?.verbForms).toEqual({
      past: 'beviel',
      pastPlural: 'bevielen',
      participle: 'bevallen',
      auxiliary: 'zijn',
    });
  });

  it('не оставляет мусора в записях', () => {
    for (const chapter of result.chapters) {
      for (const word of chapter.words) {
        // Заголовки параграфов, кириллица и обрывки скобок в nl означают сбой разбора.
        expect(word.nl).not.toMatch(/^\d+\.\d+/);
        expect(word.nl).not.toMatch(/[а-яё]/i);
        expect(word.verbForms?.participle ?? '').not.toContain(')');
      }
    }
  });

  it('ставит артикль в начало, а не в середину', () => {
    // Проверяем только существительные: в выражениях вроде «voor het eerst»
    // артикль внутри — часть самой фразы.
    const nouns = result.chapters.flatMap((c) => c.words).filter((w) => w.pos === 'noun');
    for (const word of nouns) expect(word.nl).not.toMatch(/ (de|het) /);
  });
});

describe.skipIf(!existsSync(VERBS))('разбор справочника глаголов', () => {
  it('находит глаголы с отделяемой приставкой и особые случаи', async () => {
    const verbs = parseIrregularVerbs(await readPages(VERBS));

    expect(verbs.length).toBeGreaterThan(100);
    expect(verbs.find((v) => v.nl === 'aanbieden')?.separable).toBe('aan');
    expect(verbs.find((v) => v.nl === 'breken')?.auxiliary).toBe('hebben/zijn');
    expect(verbs.find((v) => v.nl === 'eruitzien')?.noPerfect).toBe(true);
    expect(verbs.find((v) => v.nl === 'vriezen')?.impersonal).toBe(true);
  }, 120_000);
});
