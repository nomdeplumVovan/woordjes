import { Service, signal } from '@angular/core';

/** Нидерландский, а не фламандский: учебник издан в Нидерландах. */
const PREFERRED = 'nl-NL';
/**
 * Заметно медленнее обычного. Системные голоса читают в темпе носителя, а на
 * A2 важно расслышать окончания — они несут падеж, число и время.
 */
const RATE = 0.8;

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
  /** Имя выбранного голоса — видно на экране настройки. */
  readonly voiceName = signal('');
  /**
   * Какие языки синтезатор вообще предлагает. Пустой список означает не
   * «нет нидерландского», а «список ещё не пришёл» — на iOS это разные
   * поводы для разных советов.
   */
  readonly languages = signal<string[]>([]);

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
    // Но только когда есть что отменять: на iOS холостой cancel() умеет
    // подвесить синтезатор, и следующий speak() уже не звучит.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = RATE;
    speechSynthesis.speak(utterance);
  }

  /**
   * Произносит пробное слово и рассказывает, чем это кончилось. Нужно, потому
   * что молчание синтезатора многозначно: голос может быть в списке, но не
   * скачан, а на iOS звук глушит ещё и боковой переключатель.
   */
  async test(): Promise<string> {
    const voice = this.voice;
    if (!voice) return 'Голос не найден.';

    return new Promise<string>((resolve) => {
      const utterance = new SpeechSynthesisUtterance('Goedemorgen');
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = RATE;

      const silent = setTimeout(
        () => resolve('Синтезатор не отозвался. Проверьте беззвучный режим и громкость.'),
        3000,
      );
      utterance.onstart = () => {
        clearTimeout(silent);
        resolve(`Звучит: ${voice.name} (${voice.lang}).`);
      };
      utterance.onerror = (event) => {
        clearTimeout(silent);
        resolve(`Синтезатор вернул ошибку: ${event.error}.`);
      };

      speechSynthesis.speak(utterance);
    });
  }

  private refresh(): void {
    const voices = speechSynthesis.getVoices();
    this.voice = pickDutch(voices);
    this.available.set(this.voice !== null);
    this.voiceName.set(this.voice ? `${this.voice.name} (${this.voice.lang})` : '');
    this.languages.set([...new Set(voices.map((voice) => voice.lang))].sort());
  }
}
