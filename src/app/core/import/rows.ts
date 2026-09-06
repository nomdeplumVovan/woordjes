/**
 * Разбор страницы словника в записи.
 *
 * Записи нельзя собирать по «одинаковому y»: нидерландская и русская части
 * смещены друг относительно друга до 16 пунктов, а длинные записи переносятся
 * на две-три строки слева при одной справа. Поэтому якорем записи служит
 * перевод: каждый левый фрагмент притягивается к ближайшему.
 */

/** Правее этой границы — русская колонка. */
const RU_COLUMN_X = 300;
/** Правее этой — вертикальная плашка на полях и номера страниц. */
const MARGIN_X = 500;
/** Дальше этого расстояния осиротевшая строка уже не считается переносом. */
const ORPHAN_MERGE_DISTANCE = 25;
/** Допуск при склейке заголовка, разбитого на несколько фрагментов. */
const HEADING_TOLERANCE = 7;

const NOISE =
  /^(Taalcompleet A2 woordenlijst|Russisch|русский|TAALCOMPLEET|A2|WOORDENLIJST|R|USSISCH|\d+)$/;
const FOOTNOTE = /^(\* Dit woord|Слова, отмеченные)/;
export const THEME = /^Thema\s+(\d+)\s+(.+)$/;
export const CHAPTER = /^(\d+)\.(\d+)\s+(.+)$/;
const LONE_ARTICLE = /^(de|het)\s*$/;
/** Кириллица в левой колонке означает, что перевод свёрстан не в своей колонке. */
const CYRILLIC = /[а-яё]/i;

/** Фрагмент текста со страницы PDF. */
export interface Fragment {
  x: number;
  y: number;
  text: string;
  font: string;
}

export interface Entry {
  y: number;
  nl: string;
  ru: string;
  heading?: string;
}

interface Positioned extends Fragment {
  isArticle?: boolean;
}

/** Склейка без повтора: в исходнике попадаются задвоенные фрагменты. */
function joinParts(parts: string[]): string {
  const words: string[] = [];
  for (const part of parts) {
    for (const word of part.split(' ')) {
      if (word && word !== words.at(-1)) words.push(word);
    }
  }
  return words.join(' ');
}

function clean(fragments: Fragment[]): Fragment[] {
  return fragments
    .filter((f) => f.text && !NOISE.test(f.text) && !FOOTNOTE.test(f.text) && f.x <= MARGIN_X)
    .sort((a, b) => b.y - a.y);
}

/**
 * Заголовки набраны отдельным шрифтом. Это надёжнее координаты: у заголовка
 * x=81, а у существительного с артиклем het — x=80.
 */
function bodyFontOf(fragments: Fragment[]): string | null {
  const counts = new Map<string, number>();
  for (const fragment of fragments) {
    if (fragment.x >= RU_COLUMN_X) continue;
    counts.set(fragment.font, (counts.get(fragment.font) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = -1;
  for (const [font, count] of counts) {
    if (count > bestCount) {
      best = font;
      bestCount = count;
    }
  }
  return best;
}

/** Заголовок бывает разбит на фрагменты ('3.2' + 'Omdat en als') — склеиваем. */
function joinHeadings(fragments: Fragment[]): { y: number; heading: string }[] {
  const lines: { y: number; parts: Fragment[] }[] = [];
  for (const fragment of fragments) {
    const last = lines.at(-1);
    if (last && last.y - fragment.y <= HEADING_TOLERANCE) last.parts.push(fragment);
    else lines.push({ y: fragment.y, parts: [fragment] });
  }

  return lines.map((line) => ({
    y: line.y,
    heading: joinParts(line.parts.sort((a, b) => a.x - b.x).map((p) => p.text.trim())),
  }));
}

/** Ближайший по вертикали перевод. При равном расстоянии — нижний. */
function nearestAnchor(y: number, anchors: Fragment[]): Fragment | null {
  let best: Fragment | null = null;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const distance = Math.abs(anchor.y - y);
    if (distance < bestDistance || (distance === bestDistance && best && anchor.y < best.y)) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

export function parsePage(rawFragments: Fragment[]): Entry[] {
  const fragments = clean(rawFragments);
  const bodyFont = bodyFontOf(fragments);

  const headingFragments: Fragment[] = [];
  const rest: Fragment[] = [];
  for (const fragment of fragments) {
    const isHeading = fragment.x < RU_COLUMN_X && fragment.font !== bodyFont;
    (isHeading ? headingFragments : rest).push(fragment);
  }

  const anchors = rest.filter((f) => f.x >= RU_COLUMN_X);
  const left = rest.filter((f) => f.x < RU_COLUMN_X);

  // Каждый перевод открывает запись.
  const groups = new Map<Fragment, { y: number; left: Positioned[]; right: Fragment[] }>(
    anchors.map((a) => [a, { y: a.y, left: [], right: [a] }]),
  );

  const articles: Fragment[] = [];
  for (const fragment of left) {
    if (LONE_ARTICLE.test(fragment.text)) {
      articles.push(fragment);
      continue;
    }
    const anchor = nearestAnchor(fragment.y, anchors);
    if (!anchor) continue;

    const group = groups.get(anchor);
    if (!group) continue;
    group.left.push(fragment);
    group.y = Math.max(group.y, fragment.y);
  }

  // Одинокий артикль стоит по центру многострочной записи и относится
  // к её началу, а не к той строке, рядом с которой оказался.
  for (const article of articles) {
    const anchor = nearestAnchor(article.y, anchors);
    if (!anchor) continue;
    groups.get(anchor)?.left.unshift({ ...article, isArticle: true });
  }

  // Перевод, занявший две строки, даёт два якоря, а nl достаётся лишь одному
  // из них. Осиротевшую половину сливаем с ближайшей записью, сохраняя порядок
  // сверху вниз, иначе перевод склеится задом наперёд.
  const all = [...groups.values()].sort((a, b) => b.y - a.y);
  const withLeft = all.filter((g) => g.left.length > 0);
  for (const group of all) {
    if (group.left.length) continue;

    let nearest: (typeof all)[number] | null = null;
    let distance = Infinity;
    for (const candidate of withLeft) {
      const d = Math.abs(candidate.y - group.y);
      if (d < distance) {
        nearest = candidate;
        distance = d;
      }
    }
    if (!nearest || distance > ORPHAN_MERGE_DISTANCE) continue;

    nearest.right.push(...group.right);
    groups.delete(group.right[0]);
  }

  const entries: Entry[] = [...groups.values()].map((group) => ({
    y: group.y,
    nl: joinParts(
      group.left
        .sort((a, b) => Number(!!b.isArticle) - Number(!!a.isArticle) || b.y - a.y || a.x - b.x)
        .map((f) => f.text.trim()),
    ),
    ru: joinParts(group.right.sort((a, b) => b.y - a.y).map((f) => f.text.trim())),
  }));

  for (const entry of entries) {
    if (entry.ru || !CYRILLIC.test(entry.nl)) continue;

    // Перевод свёрстан в левой колонке: отделяем его от нидерландской части.
    const words = entry.nl.split(' ');
    const first = words.findIndex((w) => CYRILLIC.test(w));
    entry.ru = words.slice(first).join(' ');
    entry.nl = words.slice(0, first).join(' ');
  }

  for (const heading of joinHeadings(headingFragments)) {
    entries.push({ y: heading.y, heading: heading.heading, nl: heading.heading, ru: '' });
  }

  return entries.sort((a, b) => b.y - a.y);
}
