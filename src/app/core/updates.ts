import { ApplicationRef, Service, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, first, interval } from 'rxjs';
import { filter } from 'rxjs/operators';

/** Как часто проверять обновление, когда приложение открыто. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Service worker держит закешированную версию до перезапуска, поэтому без
 * явной проверки тестеры остаются на той сборке, которую поставили первой.
 */
@Service()
export class Updates {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);

  /** Новая версия скачана и ждёт перезагрузки. */
  readonly ready = this.swUpdate.versionUpdates.pipe(
    filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
  );

  start(): void {
    if (!this.swUpdate.isEnabled) return;

    // Проверяем только когда приложение стабилизировалось: иначе опрос
    // конкурирует с первой отрисовкой.
    const stable = this.appRef.isStable.pipe(first((isStable) => isStable));
    concat(stable, interval(CHECK_INTERVAL_MS)).subscribe(() => {
      void this.swUpdate.checkForUpdate();
    });
  }

  async apply(): Promise<void> {
    await this.swUpdate.activateUpdate();
    // Перезагрузка нужна, чтобы страница взяла новые файлы из кеша.
    location.reload();
  }
}
