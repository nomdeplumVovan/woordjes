import { Service, signal } from '@angular/core';

/** Нидерландский, а не фламандский: учебник издан в Нидерландах. */
const PREFERRED = 'nl-NL';
/** Чуть медленнее обычного: на учебной скорости слышны окончания. */
const RATE = 0.9;

/**
 * Голос для нидерландского. Локальный предпочтительнее сетевого — приложение
 * офлайновое и в дороге сетевой замолчит; `nl-NL` предпочтительнее `nl-BE` —
 * фламандское произношение заметно другое. Часть платформ пишет локаль через
 * подчёркивание, поэтому сравниваем нормализованное значение.
 */
export function pickDutch(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const dutch = voices.filter((voice) => normalize(voice).startsWith('nl'));
  if (dutch.length === 0) return null;

  return (
    dutch.find((voice) => voice.localService && normalize(voice).startsWith(PREFERRED)) ??
    dutch.find((voice) => normalize(voice).startsWith(PREFERRED)) ??
    dutch.find((voice) => voice.localService) ??
    dutch[0]
  );
}

function normalize(voice: SpeechSynthesisVoice): string {
  return voice.lang.replace('_', '-');
}

/**
 * Произношение системным синтезатором: офлайн, без бэкенда и без единого
 * килобайта в бандле.
 *
 * Главное здесь — не озвучить нидерландское слово чужим голосом. Без
 * подходящего голоса браузер не молчит, а читает текст языком по умолчанию:
 * `huis` превращается в английское «хаус». Для тренажёра это хуже тишины,
 * поэтому при отсутствии голоса озвучка выключается целиком.
 */
@Service()
export class Speech {
  private voice: SpeechSynthesisVoice | null = null;

  /** Установлен ли в системе нидерландский голос. */
  readonly available = signal(false);

  constructor() {
    // Синтезатора может не быть вовсе — в тестовом окружении, например.
    if (typeof speechSynthesis === 'undefined') return;

    this.refresh();
    // Список голосов приходит асинхронно: первый getVoices() часто пуст.
    speechSynthesis.addEventListener('voiceschanged', () => this.refresh());
  }

  speak(text: string): void {
    const voice = this.voice;
    if (!voice) return;

    // Иначе нажатия копили бы очередь: дослушивать прошлые слова незачем.
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = RATE;
    speechSynthesis.speak(utterance);
  }

  private refresh(): void {
    this.voice = pickDutch(speechSynthesis.getVoices());
    this.available.set(this.voice !== null);
  }
}
