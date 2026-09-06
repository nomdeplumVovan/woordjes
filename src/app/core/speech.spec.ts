import { pickDutch } from './speech';

function voice(lang: string, name: string, localService = true): SpeechSynthesisVoice {
  return { lang, name, localService, default: false, voiceURI: name } as SpeechSynthesisVoice;
}

describe('pickDutch', () => {
  it('не находит голоса, когда нидерландского нет', () => {
    expect(pickDutch([voice('en-US', 'Alex'), voice('ru-RU', 'Milena')])).toBeNull();
  });

  it('предпочитает нидерландский фламандскому', () => {
    const picked = pickDutch([voice('nl-BE', 'Ellen'), voice('nl-NL', 'Xander')]);
    expect(picked?.name).toBe('Xander');
  });

  it('предпочитает локальный голос сетевому', () => {
    const picked = pickDutch([voice('nl-NL', 'Cloud', false), voice('nl-NL', 'Xander', true)]);
    expect(picked?.name).toBe('Xander');
  });

  it('берёт фламандский, если нидерландского нет вовсе', () => {
    expect(pickDutch([voice('en-GB', 'Daniel'), voice('nl-BE', 'Ellen')])?.name).toBe('Ellen');
  });

  it('понимает локаль через подчёркивание', () => {
    expect(pickDutch([voice('nl_NL', 'Android')])?.name).toBe('Android');
  });

  it('не путает нидерландский с другими языками на nl', () => {
    // Ложных совпадений быть не должно: сравнение идёт по началу локали.
    expect(pickDutch([voice('en-NL', 'Dutch English')])).toBeNull();
  });
});
