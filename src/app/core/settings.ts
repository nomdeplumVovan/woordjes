import { Service, signal } from '@angular/core';

const SPEAK_ON_ANSWER = 'woordjes.speakOnAnswer';

/**
 * Приватный режим и запрет на данные сайта роняют доступ к localStorage
 * исключением, а не пустым значением, поэтому обе операции в try.
 */
function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Настройка не переживёт перезагрузку — это не повод ломать экран.
  }
}

/**
 * Настройки интерфейса. Живут в localStorage, а не в IndexedDB: это
 * предпочтения устройства, их незачем везти в копии прогресса, и читать их
 * нужно синхронно — иначе галка мигала бы при каждом открытии тренировки.
 */
@Service()
export class Settings {
  /**
   * Произносить слово сразу при показе ответа. По умолчанию выключено: в
   * тихом месте телефон не должен заговорить сам, пока его не попросили.
   * Настройка общая для всех карточек и режимов — это привычка, а не
   * свойство отдельного вопроса.
   */
  readonly speakOnAnswer = signal(read(SPEAK_ON_ANSWER));

  setSpeakOnAnswer(on: boolean): void {
    this.speakOnAnswer.set(on);
    write(SPEAK_ON_ANSWER, on);
  }
}
