import type { Word } from './models';

/**
 * Почему у глагола именно этот вспомогательный. Без объяснения выбор
 * hebben/zijn выглядит произволом, который остаётся только зубрить,
 * хотя за ним стоят три довольно простых правила.
 */
export interface AuxiliaryHint {
  /** Краткое правило по-нидерландски — как его формулируют в учебниках. */
  nl: string;
  ru: string;
  /** Пара примеров для глаголов, которые допускают оба варианта. */
  example?: string;
}

/** Перемещение из одной точки в другую. */
const MOVEMENT = new Set([
  'aankomen',
  'binnenkomen',
  'doorgaan',
  'gaan',
  'komen',
  'langskomen',
  'omgaan',
  'opstaan',
  'oversteken',
  'uitgaan',
  'vallen',
  'verdergaan',
  'vertrekken',
  'weggaan',
]);

/** Переход в новое состояние. */
const CHANGE = new Set([
  'beginnen',
  'bevallen',
  'gebeuren',
  'groeien',
  'overlijden',
  'scheiden',
  'schrikken',
  'slagen',
  'sterven',
  'stoppen',
  'veranderen',
  'vergeten',
  'verhuizen',
  'wennen',
  'worden',
  'zakken',
]);

/** Само состояние, а не действие. */
const STATE = new Set(['zijn', 'blijven']);

/** Глаголы движения: hebben про сам процесс, zijn — когда указана цель. */
const MOVEMENT_BOTH = new Set(['fietsen', 'lopen', 'rijden', 'springen', 'varen', 'zwemmen']);

/** Переходные: hebben с дополнением, zijn — когда предмет изменился сам. */
const TRANSITIVE_BOTH = new Set(['breken', 'sluiten', 'verliezen', 'draaien', 'klimmen']);

export function auxiliaryHint(word: Word): AuxiliaryHint | null {
  const auxiliary = word.verbForms?.auxiliary;
  if (!auxiliary) return null;

  const nl = word.nl;

  if (auxiliary === 'hebben/zijn') {
    if (TRANSITIVE_BOTH.has(nl)) {
      return {
        nl: 'hebben met lijdend voorwerp, zijn zonder',
        ru: 'hebben — если есть дополнение, zijn — если предмет изменился сам',
        example: 'Ik heb het glas gebroken · Het glas is gebroken',
      };
    }
    return {
      nl: 'hebben voor de bezigheid, zijn met een richting',
      ru: 'hebben — про само занятие, zijn — когда указано куда',
      example: 'Ik heb gezwommen · Ik ben naar de overkant gezwommen',
    };
  }

  if (auxiliary === 'zijn') {
    if (MOVEMENT.has(nl)) {
      return {
        nl: 'beweging van de ene plek naar de andere',
        ru: 'zijn — перемещение из одного места в другое',
      };
    }
    if (CHANGE.has(nl)) {
      return {
        nl: 'verandering van toestand',
        ru: 'zijn — переход в новое состояние',
      };
    }
    if (STATE.has(nl)) {
      return { nl: 'toestand, geen handeling', ru: 'zijn — состояние, а не действие' };
    }
    // Остальные zijn-глаголы приходится запоминать.
    return {
      nl: 'onthouden: dit werkwoord krijgt zijn',
      ru: 'zijn — это исключение, его запоминают',
    };
  }

  // hebben стоит у большинства глаголов и объяснения не требует.
  return null;
}

/** Полное правило для справки: три случая, когда перфект строится с zijn. */
export const AUXILIARY_RULES: { nl: string; ru: string; verbs: string[] }[] = [
  {
    nl: 'beweging van de ene plek naar de andere',
    ru: 'Перемещение из точки в точку',
    verbs: ['gaan', 'komen', 'weggaan', 'vertrekken', 'aankomen', 'vallen'],
  },
  {
    nl: 'verandering van toestand',
    ru: 'Переход в новое состояние',
    verbs: ['worden', 'beginnen', 'bevallen', 'schrikken', 'sterven'],
  },
  {
    nl: 'toestand, geen handeling',
    ru: 'Состояние, а не действие',
    verbs: ['zijn', 'blijven'],
  },
];

/** Глаголы, допускающие оба вспомогательных: смысл меняется вместе с выбором. */
export const AUXILIARY_BOTH: { ru: string; example: string; verbs: string[] }[] = [
  {
    ru: 'hebben с дополнением, zijn — когда предмет изменился сам',
    example: 'Ik heb het glas gebroken · Het glas is gebroken',
    verbs: ['breken', 'sluiten', 'verliezen'],
  },
  {
    ru: 'hebben про само занятие, zijn — когда указано куда',
    example: 'Ik heb gezwommen · Ik ben naar de overkant gezwommen',
    verbs: ['lopen', 'rijden', 'varen', 'zwemmen', 'springen'],
  },
];
