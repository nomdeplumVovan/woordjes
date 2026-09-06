/**
 * Генерирует иконки приложения из SVG.
 *
 * Запуск: node tools/make-icons.mjs
 *
 * iOS не умеет maskable-иконки и не скругляет прозрачный фон сам, поэтому
 * основной набор идёт с непрозрачной заливкой до краёв. Отдельная maskable
 * версия с полями нужна Android, который обрезает иконку под свою форму.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/icons';
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

const BACKGROUND = '#1f3a8a';
const INK = '#ffffff';
const ACCENT = '#f59e0b';

/** @param {number} pad доля поля вокруг знака: у maskable она больше */
function svg(pad) {
  const size = 512;
  const inner = size * (1 - pad * 2);
  const fontSize = inner * 0.62;
  const baseline = size / 2 + fontSize * 0.35;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BACKGROUND}"/>
  <text x="50%" y="${baseline}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="${INK}">W</text>
  <rect x="${size * 0.18}" y="${size * 0.78}" width="${size * 0.64}" height="${size * 0.05}"
        rx="${size * 0.025}" fill="${ACCENT}"/>
</svg>`;
}

mkdirSync(OUT, { recursive: true });

const main = Buffer.from(svg(0.1));
for (const size of SIZES) {
  await sharp(main).resize(size, size).png().toFile(`${OUT}/icon-${size}x${size}.png`);
}

// Android обрезает иконку под форму темы — знак должен уместиться в круг.
const maskable = Buffer.from(svg(0.22));
await sharp(maskable).resize(512, 512).png().toFile(`${OUT}/icon-maskable-512x512.png`);

// Favicon в том же стиле, чтобы вкладка не выбивалась.
await sharp(main).resize(32, 32).png().toFile('public/favicon.png');

writeFileSync('public/icons/source.svg', svg(0.1));
console.log(`иконки: ${SIZES.length} размеров + maskable + favicon`);
