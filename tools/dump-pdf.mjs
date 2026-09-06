// Разведка: печатает текстовые фрагменты первой страницы с координатами,
// чтобы понять раскладку колонок словника.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const pageNo = Number(process.argv[3] ?? 1);

const doc = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise;
console.log('страниц:', doc.numPages);

const page = await doc.getPage(pageNo);
const content = await page.getTextContent();

for (const item of content.items) {
  if (!item.str.trim()) continue;
  const [, , , , x, y] = item.transform;
  console.log(`x=${x.toFixed(0).padStart(4)} y=${y.toFixed(0).padStart(4)} | ${item.str}`);
}
