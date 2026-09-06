import { auxiliaryHint } from './auxiliary';
import type { Word } from './models';

function verb(nl: string, auxiliary?: 'hebben' | 'zijn' | 'hebben/zijn'): Word {
  return {
    id: `x:${nl}`,
    chapterId: 'x',
    nl,
    ru: '',
    pos: 'verb',
    verbForms: { past: '', participle: '', auxiliary },
  };
}

describe('правило hebben/zijn', () => {
  it('объясняет zijn через перемещение', () => {
    expect(auxiliaryHint(verb('gaan', 'zijn'))?.ru).toContain('перемещение');
    expect(auxiliaryHint(verb('weggaan', 'zijn'))?.ru).toContain('перемещение');
  });

  it('объясняет zijn через смену состояния', () => {
    expect(auxiliaryHint(verb('worden', 'zijn'))?.ru).toContain('состояние');
    expect(auxiliaryHint(verb('beginnen', 'zijn'))?.ru).toContain('состояние');
  });

  it('разбирает случай с обоими вспомогательными', () => {
    const transitive = auxiliaryHint(verb('breken', 'hebben/zijn'));
    expect(transitive?.ru).toContain('дополнение');
    // Пример нагляднее правила: «я разбил» против «разбилось».
    expect(transitive?.example).toContain('Het glas is gebroken');

    const movement = auxiliaryHint(verb('zwemmen', 'hebben/zijn'));
    expect(movement?.ru).toContain('куда');
  });

  it('молчит про hebben — он стоит у большинства глаголов', () => {
    expect(auxiliaryHint(verb('werken', 'hebben'))).toBeNull();
    expect(auxiliaryHint(verb('lenen'))).toBeNull();
  });

  it('не оставляет глагол с zijn без объяснения', () => {
    // Даже для глагола вне списков возвращается честное «это исключение».
    const hint = auxiliaryHint(verb('onbekendwerkwoord', 'zijn'));
    expect(hint).not.toBeNull();
    expect(hint?.ru).toContain('исключение');
  });
});
