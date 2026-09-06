import type { Word } from './models';

/**
 * Правила образования регулярного глагола. Нужны дважды: чтобы отличить
 * настоящее исключение от предсказуемого глагола и чтобы построить
 * правдоподобно неверный вариант — тот самый, который образуют по правилу
 * вместо того, чтобы вспомнить форму.
 */

/**
 * Безударные приставки: такой глагол не получает ge- в причастии
 * (ontmoeten -> ontmoet, bedanken -> bedankt).
 */
const INSEPARABLE_PREFIXES = ['be', 'ver', 'ont', 'her', 'ge', 'er'];

/** 't kofschip: после глухой согласной окончание оглушается. */
const VOICELESS = ['t', 'k', 'f', 's', 'ch', 'p'];
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Сколько в слове групп гласных — грубая мера числа слогов. */
function vowelGroups(word: string): number {
  let groups = 0;
  let inVowel = false;
  for (const char of word) {
    const isVowel = VOWELS.has(char);
    if (isVowel && !inVowel) groups++;
    inVowel = isVowel;
  }
  return groups;
}

interface Stem {
  /** Как основа пишется: leven -> leef. */
  spelled: string;
  /** Окончание -te (после глухой) или -de. Считается до оглушения на письме. */
  voiceless: boolean;
}

/**
 * Основа глагола. В инфинитиве гласная стоит в открытом слоге, в основе слог
 * закрывается — отсюда удвоение (won -> woon) и упрощение двойных согласных
 * (zitt -> zit).
 */
function stemParts(infinitive: string): Stem {
  let stem = infinitive.endsWith('en')
    ? infinitive.slice(0, -2)
    : infinitive.endsWith('n')
      ? infinitive.slice(0, -1)
      : infinitive;

  // gaan -> gaa -> ga: долгая гласная в конце основы не удваивается дважды.
  if (stem.length > 2 && stem.at(-1) === stem.at(-2) && VOWELS.has(stem.at(-1)!)) {
    stem = stem.slice(0, -1);
  }

  // zetten -> zett -> zet. Слог уже закрыт двойной согласной, поэтому
  // удваивать гласную после этого нельзя.
  let simplified = false;
  if (stem.length > 2 && stem.at(-1) === stem.at(-2) && !VOWELS.has(stem.at(-1)!)) {
    stem = stem.slice(0, -1);
    simplified = true;
  }

  // Одна согласная после одной гласной: слог закрывается, гласная удваивается
  // (won -> woon). Работает только в односложной основе: в «regel» последний
  // слог безударный, и удвоения нет — иначе получилось бы «regeelde».
  const [a, b, c] = [stem.at(-3), stem.at(-2), stem.at(-1)];
  const singleSyllable = vowelGroups(stem) === 1;
  const semivowel = c === 'w' || c === 'j';
  if (
    !simplified &&
    singleSyllable &&
    !semivowel &&
    a &&
    b &&
    c &&
    !VOWELS.has(a) &&
    VOWELS.has(b) &&
    !VOWELS.has(c)
  ) {
    stem = `${stem.slice(0, -1)}${b}${c}`;
  }

  // Звонкость определяется до оглушения на письме: leven -> leefde, а не leefte.
  const voiceless = !stem.endsWith('v') && !stem.endsWith('z') && endsVoiceless(stem);

  let spelled = stem;
  if (spelled.endsWith('v')) spelled = `${spelled.slice(0, -1)}f`;
  if (spelled.endsWith('z')) spelled = `${spelled.slice(0, -1)}s`;

  return { spelled, voiceless };
}

function endsVoiceless(stem: string): boolean {
  return VOICELESS.some((ending) => stem.endsWith(ending));
}

export function stemOf(infinitive: string): string {
  return stemParts(infinitive).spelled;
}

/** werken -> werkte, leren -> leerde */
export function regularPast(infinitive: string): string {
  const { spelled, voiceless } = stemParts(infinitive);
  return `${spelled}${voiceless ? 'te' : 'de'}`;
}

/** werken -> gewerkt, leren -> geleerd */
export function regularParticiple(infinitive: string): string {
  const { spelled, voiceless } = stemParts(infinitive);
  const inseparable = INSEPARABLE_PREFIXES.some((p) => infinitive.startsWith(p));
  const prefix = inseparable ? '' : 'ge';

  // Основа уже кончается на согласную окончания — вторая не пишется:
  // zetten -> gezet, ontmoeten -> ontmoet. В прошедшем времени, наоборот,
  // удвоение сохраняется: praatte.
  const ending = voiceless ? 't' : 'd';
  const suffix = spelled.endsWith(ending) ? '' : ending;

  return `${prefix}${spelled}${suffix}`;
}

/**
 * Глагол стоит тренировать, если его формы не выводятся по правилу.
 * Тег из официального справочника надёжнее эвристики, но справочник покрывает
 * не всё, поэтому проверяем и формы.
 */
export function isIrregularVerb(word: Word): boolean {
  const forms = word.verbForms;
  if (!forms) return false;
  if (word.tags?.includes('onregelmatig')) return true;

  // Правило надёжно только для односложной основы. У «studeren» ударение
  // падает на -e- (studeerde), у «leveren» — нет (leverde), и по написанию
  // это не различить. Ошибиться здесь значит гонять предсказуемый глагол
  // как исключение, поэтому многосложные отдаём справочнику.
  if (vowelGroups(stemOf(word.nl)) !== 1) return false;

  // Отделяемые глаголы («stuurde op») и выражения по общему правилу не
  // спрягаются, поэтому для них полагаемся только на справочник.
  const simple = !word.nl.includes(' ') && !word.nl.includes('(') && !forms.past.includes(' ');
  if (!simple) return false;

  return forms.past !== regularPast(word.nl) || forms.participle !== regularParticiple(word.nl);
}

/** Полная форма перфекта: 'hebben gewerkt', 'zijn gegaan'. */
export function perfectOf(word: Word): string | null {
  const forms = word.verbForms;
  if (!forms?.participle) return null;
  return forms.auxiliary ? `${forms.auxiliary} ${forms.participle}` : forms.participle;
}
