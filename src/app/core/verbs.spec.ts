import { isIrregularVerb, regularParticiple, regularPast, stemOf } from './verbs';
import type { Word } from './models';

function verb(nl: string, past: string, participle: string, tags?: string[]): Word {
  return {
    id: `x:${nl}`,
    chapterId: 'x',
    nl,
    ru: '',
    pos: 'verb',
    verbForms: { past, participle },
    tags,
  };
}

describe('правила регулярного спряжения', () => {
  it('строит основу', () => {
    expect(stemOf('werken')).toBe('werk');
    // Открытый слог: гласная удваивается, когда слог закрывается.
    expect(stemOf('wonen')).toBe('woon');
    expect(stemOf('maken')).toBe('maak');
    // Двойная согласная упрощается, гласная при этом остаётся короткой.
    expect(stemOf('zetten')).toBe('zet');
    // Оглушение на письме.
    expect(stemOf('leven')).toBe('leef');
    expect(stemOf('reizen')).toBe('reis');
    expect(stemOf('gaan')).toBe('ga');
    // Многосложная основа: последний слог безударный, удвоения нет.
    expect(stemOf('regelen')).toBe('regel');
    expect(stemOf('openen')).toBe('open');
    expect(stemOf('leveren')).toBe('lever');
    // Перед полугласной w удвоения тоже не бывает.
    expect(stemOf('duwen')).toBe('duw');
  });

  it('образует прошедшее время по правилу t kofschip', () => {
    expect(regularPast('werken')).toBe('werkte');
    expect(regularPast('fietsen')).toBe('fietste');
    expect(regularPast('praten')).toBe('praatte');
    expect(regularPast('leren')).toBe('leerde');
    expect(regularPast('wonen')).toBe('woonde');
    expect(regularPast('zetten')).toBe('zette');
    // Звонкость считается до оглушения на письме: leefde, а не leefte.
    expect(regularPast('leven')).toBe('leefde');
    expect(regularPast('reizen')).toBe('reisde');
    expect(regularPast('regelen')).toBe('regelde');
    expect(regularPast('openen')).toBe('opende');
    expect(regularPast('duwen')).toBe('duwde');
  });

  it('образует причастие', () => {
    expect(regularParticiple('werken')).toBe('gewerkt');
    expect(regularParticiple('leren')).toBe('geleerd');
    expect(regularParticiple('leven')).toBe('geleefd');
    expect(regularParticiple('fietsen')).toBe('gefietst');
    // Безударная приставка — причастие без ge-.
    expect(regularParticiple('bedanken')).toBe('bedankt');
    expect(regularParticiple('ontmoeten')).toBe('ontmoet');
    expect(regularParticiple('verhuizen')).toBe('verhuisd');
    // Основа на -t не удваивает согласную в причастии.
    expect(regularParticiple('zetten')).toBe('gezet');
    expect(regularParticiple('praten')).toBe('gepraat');
  });

  it('отличает исключение от предсказуемого глагола', () => {
    expect(isIrregularVerb(verb('gaan', 'ging', 'gegaan'))).toBe(true);
    expect(isIrregularVerb(verb('werken', 'werkte', 'gewerkt'))).toBe(false);
    expect(isIrregularVerb(verb('lenen', 'leende', 'geleend'))).toBe(false);
    // Тег из справочника перевешивает эвристику.
    expect(isIrregularVerb(verb('vragen', 'vroeg', 'gevraagd', ['onregelmatig']))).toBe(true);
  });

  it('не судит по правилу о многосложных основах', () => {
    // studeren -> studeerde, leveren -> leverde: по написанию не различить,
    // поэтому такие глаголы отдаются справочнику, а не эвристике.
    expect(isIrregularVerb(verb('studeren', 'studeerde', 'gestudeerd'))).toBe(false);
    expect(isIrregularVerb(verb('ontmoeten', 'ontmoette', 'ontmoet'))).toBe(false);
  });

  it('не судит по правилу об отделяемых глаголах и выражениях', () => {
    // «stuurde op» по общему правилу не образуется — тут решает только справочник.
    expect(isIrregularVerb(verb('opsturen', 'stuurde op', 'opgestuurd'))).toBe(false);
    expect(isIrregularVerb(verb('geluk hebben', 'had geluk', 'geluk gehad'))).toBe(false);
    // А помеченный справочником остаётся исключением при любой форме записи.
    expect(isIrregularVerb(verb('langskomen', 'kwam langs', 'langsgekomen', ['onregelmatig']))).toBe(
      true,
    );
  });
});
