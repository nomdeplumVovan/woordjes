import { TestBed } from '@angular/core/testing';
import { db } from './db';
import { Quiz } from './quiz';
import type { Chapter, Word } from './models';

function word(id: string, chapterId: string, nl: string, ru: string, extra: Partial<Word> = {}): Word {
  return { id, chapterId, nl, ru, pos: 'noun', ...extra };
}

function chapter(id: string, theme: number, order: number): Chapter {
  return {
    id,
    title: id,
    titleRu: id,
    theme,
    themeTitle: `Thema ${theme}`,
    level: 'A2',
    order,
    wordCount: 0,
  };
}

describe('Quiz', () => {
  let quiz: Quiz;

  beforeEach(async () => {
    await db.delete();
    await db.open();

    await db.chapters.bulkPut([
      chapter('1.1', 1, 101),
      chapter('1.2', 1, 102),
      chapter('5.1', 5, 501),
    ]);

    await db.words.bulkPut([
      word('1.1:a', '1.1', 'buren', 'соседи'),
      word('1.1:b', '1.1', 'hamer', 'молот'),
      word('1.1:c', '1.1', 'oudste', 'старший'),
      word('1.1:d', '1.1', 'jongste', 'младший'),
      word('1.1:e', '1.1', 'succes', 'удача'),
      word('1.2:a', '1.2', 'rest', 'остаток'),
      word('5.1:a', '5.1', 'winkel', 'магазин'),
      word('1.1:skip', '1.1', 'werkwoord', 'глагол', { tags: ['niet leren'] }),
    ]);

    quiz = TestBed.inject(Quiz);
  });

  it('не берёт в тренировку слова с пометкой «учить не нужно»', async () => {
    const questions = await quiz.forChapter('1.1', 20);
    expect(questions.some((q) => q.word.id === '1.1:skip')).toBe(false);
    expect(questions.every((q) => !q.options.includes('глагол'))).toBe(true);
  });

  it('даёт четыре различных варианта, среди них верный', async () => {
    for (const question of await quiz.forChapter('1.1', 20)) {
      expect(question.options.length).toBe(4);
      expect(new Set(question.options).size).toBe(4);

      const expected = question.direction === 'nl-ru' ? question.word.ru : question.word.nl;
      expect(question.options[question.correctIndex]).toBe(expected);
    }
  });

  it('подбирает отвлекающие варианты из того же параграфа', async () => {
    const questions = await quiz.forChapter('1.1', 20);
    const foreign = ['магазин', 'winkel', 'остаток', 'rest'];

    for (const question of questions) {
      const distractors = question.options.filter((_, i) => i !== question.correctIndex);
      // В параграфе 1.1 хватает своих слов, поэтому чужие сюда попадать не должны.
      expect(distractors.some((d) => foreign.includes(d))).toBe(false);
    }
  });

  it('показывает существительное с артиклем', async () => {
    await db.words.put(word('1.1:art', '1.1', 'tafel', 'стол', { article: 'de' }));

    const questions = await quiz.forChapter('1.1', 50);
    const question = questions.find((q) => q.word.id === '1.1:art' && q.direction === 'nl-ru');
    if (question) expect(question.prompt).toBe('de tafel');
  });


  it('не предлагает вариант, делящий слово с правильным ответом', async () => {
    await db.chapters.put(chapter('2.1', 2, 201));
    await db.words.bulkPut([
      word('2.1:pas', '2.1', 'pas', 'только что; всего лишь', { pos: 'adv' }),
      word('2.1:totaal', '2.1', 'totaal', 'общий, всего', { pos: 'adv' }),
      word('2.1:x', '2.1', 'ander', 'другой', { pos: 'adv' }),
      word('2.1:y', '2.1', 'zwaar', 'тяжёлый', { pos: 'adv' }),
      word('2.1:z', '2.1', 'duur', 'дорогой', { pos: 'adv' }),
    ]);

    const questions = await quiz.forChapter('2.1', 20);
    const pas = questions.filter((q) => q.word.id === '2.1:pas' && q.direction === 'nl-ru');

    for (const question of pas) {
      // «общий, всего» рядом с «всего лишь» читается как второй верный ответ.
      expect(question.options).not.toContain('общий, всего');
    }
  });

  it('добирает варианты даже когда похожих не избежать', async () => {
    await db.chapters.put(chapter('3.1', 3, 301));
    await db.words.bulkPut([
      word('3.1:a', '3.1', 'een', 'всего один', { pos: 'adv' }),
      word('3.1:b', '3.1', 'twee', 'всего два', { pos: 'adv' }),
      word('3.1:c', '3.1', 'drie', 'всего три', { pos: 'adv' }),
      word('3.1:d', '3.1', 'vier', 'всего четыре', { pos: 'adv' }),
    ]);

    for (const question of await quiz.forChapter('3.1', 10)) {
      expect(question.options.length).toBe(4);
      expect(new Set(question.options).size).toBe(4);
    }
  });

  it('возвращает пусто для несуществующего параграфа', async () => {
    expect(await quiz.forChapter('9.9')).toEqual([]);
  });

  describe('сессия на сегодня', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    it('сначала берёт слова с подошедшим сроком', async () => {
      const now = Date.now();
      await db.progress.bulkPut([
        { wordId: '1.1:a', skill: 'translation' as const, box: 2, dueAt: now - DAY_MS, correct: 1, wrong: 0, lastSeenAt: now },
        { wordId: '1.1:b', skill: 'translation' as const, box: 1, dueAt: now - 2 * DAY_MS, correct: 0, wrong: 1, lastSeenAt: now },
        // Срок ещё не подошёл — в сессию попасть не должно.
        { wordId: '1.1:c', skill: 'translation' as const, box: 3, dueAt: now + 5 * DAY_MS, correct: 3, wrong: 0, lastSeenAt: now },
      ]);

      const ids = (await quiz.forToday(2)).map((q) => q.word.id);
      expect(ids).toHaveLength(2);
      expect(ids).toContain('1.1:a');
      expect(ids).toContain('1.1:b');
      expect(ids).not.toContain('1.1:c');
    });

    it('добирает новые слова, когда повторять нечего', async () => {
      const questions = await quiz.forToday(5);
      expect(questions).toHaveLength(5);
      // Прогресса нет ни у кого, значит все слова новые.
      expect(questions.every((q) => q.word.id !== '1.1:skip')).toBe(true);
    });

    it('вводит новые слова по порядку параграфов', async () => {
      const questions = await quiz.forToday(5);
      const chapters = questions.map((q) => q.word.chapterId);
      // Первый параграф содержит пять слов к изучению — до 1.2 и 5.1 дело не доходит.
      expect(chapters.every((id) => id === '1.1')).toBe(true);
    });

    it('не показывает слово, у которого срок ещё не наступил, даже если новых нет', async () => {
      const now = Date.now();
      const all = await db.words.toArray();
      await db.progress.bulkPut(
        all.map((w) => ({
          wordId: w.id,
          skill: 'translation' as const,
          box: 3,
          dueAt: now + 5 * DAY_MS,
          correct: 3,
          wrong: 0,
          lastSeenAt: now,
        })),
      );

      expect(await quiz.forToday(10)).toEqual([]);
    });

    it('считает, что ждёт повторения, что ново и что выучено', async () => {
      const now = Date.now();
      await db.progress.bulkPut([
        { wordId: '1.1:a', skill: 'translation' as const, box: 5, dueAt: now - DAY_MS, correct: 5, wrong: 0, lastSeenAt: now },
        { wordId: '1.1:b', skill: 'translation' as const, box: 4, dueAt: now + DAY_MS, correct: 4, wrong: 0, lastSeenAt: now },
        { wordId: '1.1:c', skill: 'translation' as const, box: 1, dueAt: now + DAY_MS, correct: 0, wrong: 2, lastSeenAt: now },
      ]);

      const counts = await quiz.counts();
      expect(counts.due).toBe(1);
      // Слово с тегом «niet leren» не считается ни новым, ни выученным.
      expect(counts.fresh).toBe(4);
      expect(counts.learned).toBe(2);
    });
  });


  describe('режим de/het', () => {
    beforeEach(async () => {
      await db.words.bulkPut([
        word('1.1:de1', '1.1', 'tafel', 'стол', { article: 'de', plural: 'tafels' }),
        word('1.1:het1', '1.1', 'huis', 'дом', { article: 'het', plural: 'huizen' }),
        word('1.1:het2', '1.1', 'kind', 'ребёнок', { article: 'het', plural: 'kinderen' }),
        // Без артикля и не существительное — в режим попадать не должны.
        word('1.1:verb', '1.1', 'lenen', 'одалживать', { pos: 'verb' }),
        word('1.1:noart', '1.1', 'succes', 'удача'),
      ]);
    });

    it('спрашивает только существительные с артиклем', async () => {
      const questions = await quiz.forArticles(50);
      const ids = questions.map((q) => q.word.id);

      expect(ids).toContain('1.1:de1');
      expect(ids).toContain('1.1:het1');
      expect(ids).not.toContain('1.1:verb');
      expect(ids).not.toContain('1.1:noart');
    });

    it('даёт два варианта и верный индекс', async () => {
      for (const question of await quiz.forArticles(50)) {
        expect(question.skill).toBe('article');
        expect(question.options).toEqual(['de', 'het']);
        expect(question.options[question.correctIndex]).toBe(question.word.article);
        // Спрашиваем слово без артикля — иначе ответ был бы в самом вопросе.
        expect(question.prompt).toBe(question.word.nl);
      }
    });

    it('не путает прогресс артиклей с прогрессом перевода', async () => {
      const now = Date.now();
      // Перевод выучен и повторять не нужно, но артикль ещё ни разу не спрашивали.
      await db.progress.bulkPut([
        {
          wordId: '1.1:het1',
          skill: 'translation' as const,
          box: 5,
          dueAt: now + 16 * 24 * 60 * 60 * 1000,
          correct: 5,
          wrong: 0,
          lastSeenAt: now,
        },
      ]);

      const ids = (await quiz.forArticles(50)).map((q) => q.word.id);
      expect(ids).toContain('1.1:het1');
    });

    it('не показывает артикль, срок которого ещё не подошёл', async () => {
      const now = Date.now();
      const nouns = (await db.words.toArray()).filter(
        (w) => w.pos === 'noun' && (w.article === 'de' || w.article === 'het'),
      );
      await db.progress.bulkPut(
        nouns.map((w) => ({
          wordId: w.id,
          skill: 'article' as const,
          box: 3,
          dueAt: now + 4 * 24 * 60 * 60 * 1000,
          correct: 3,
          wrong: 0,
          lastSeenAt: now,
        })),
      );

      expect(await quiz.forArticles(10)).toEqual([]);
    });
  });


  describe('режим форм глаголов', () => {
    beforeEach(async () => {
      await db.words.bulkPut([
        word('1.1:gaan', '1.1', 'gaan', 'идти', {
          pos: 'verb',
          verbForms: { past: 'ging', pastPlural: 'gingen', participle: 'gegaan', auxiliary: 'zijn' },
          tags: ['onregelmatig'],
        }),
        word('1.1:komen', '1.1', 'komen', 'приходить', {
          pos: 'verb',
          verbForms: { past: 'kwam', pastPlural: 'kwamen', participle: 'gekomen', auxiliary: 'zijn' },
          tags: ['onregelmatig'],
        }),
        word('1.1:nemen', '1.1', 'nemen', 'брать', {
          pos: 'verb',
          verbForms: {
            past: 'nam',
            pastPlural: 'namen',
            participle: 'genomen',
            auxiliary: 'hebben',
          },
          tags: ['onregelmatig'],
        }),
        word('1.1:zien', '1.1', 'zien', 'видеть', {
          pos: 'verb',
          verbForms: { past: 'zag', pastPlural: 'zagen', participle: 'gezien', auxiliary: 'hebben' },
          tags: ['onregelmatig'],
        }),
        // Предсказуемый глагол: тренировать его незачем.
        word('1.1:werken', '1.1', 'werken', 'работать', {
          pos: 'verb',
          verbForms: { past: 'werkte', participle: 'gewerkt', auxiliary: 'hebben' },
        }),
      ]);
    });

    it('берёт только глаголы с непредсказуемыми формами', async () => {
      const ids = (await quiz.forVerbs(50)).map((q) => q.word.id);
      expect(ids).toContain('1.1:gaan');
      expect(ids).not.toContain('1.1:werken');
    });

    it('спрашивает прошедшее время или перфект целиком', async () => {
      for (const question of await quiz.forVerbs(50)) {
        expect(question.skill).toBe('verb');
        expect(question.prompt).toBe(question.word.nl);

        const forms = question.word.verbForms!;
        const answer = question.options[question.correctIndex];
        const perfect = `${forms.auxiliary} ${forms.participle}`;

        if (question.subPrompt === 'verleden tijd') expect(answer).toBe(forms.past);
        else expect(answer).toBe(perfect);
      }
    });

    it('подсовывает форму, образованную по правилу', async () => {
      const questions = await quiz.forVerbs(50);
      const past = questions.filter(
        (q) => q.word.id === '1.1:werken' || q.subPrompt === 'verleden tijd',
      );

      const gaan = past.find((q) => q.word.id === '1.1:gaan');
      // «gaande» — ровно та ошибка, которую делают вместо «ging».
      if (gaan) expect(gaan.options).toContain('gade');
    });

    it('подсовывает неотделённую приставку', async () => {
      await db.words.put(
        word('1.1:doorgaan', '1.1', 'doorgaan', 'продолжать', {
          pos: 'verb',
          verbForms: {
            past: 'ging door',
            pastPlural: 'gingen door',
            participle: 'doorgegaan',
            auxiliary: 'zijn',
            separable: 'door',
          },
          tags: ['onregelmatig'],
        }),
      );

      const past = (await quiz.forVerbs(50)).filter(
        (q) => q.word.id === '1.1:doorgaan' && q.subPrompt === 'verleden tijd',
      );

      // «doorging» вместо «ging door» — забыли отделить приставку.
      for (const question of past) expect(question.options).toContain('doorging');
    });

    it('подсовывает перепутанный вспомогательный глагол', async () => {
      const perfect = (await quiz.forVerbs(50)).filter(
        (q) => q.word.id === '1.1:gaan' && q.subPrompt === 'voltooide tijd',
      );

      // Верно «zijn gegaan», ловушка — «hebben gegaan».
      for (const question of perfect) {
        expect(question.options).toContain('hebben gegaan');
        expect(question.options[question.correctIndex]).toBe('zijn gegaan');
      }
    });

    it('не путает прогресс глаголов с прогрессом перевода', async () => {
      const now = Date.now();
      await db.progress.put({
        wordId: '1.1:gaan',
        skill: 'translation' as const,
        box: 5,
        dueAt: now + 16 * 24 * 60 * 60 * 1000,
        correct: 5,
        wrong: 0,
        lastSeenAt: now,
      });

      const ids = (await quiz.forVerbs(50)).map((q) => q.word.id);
      expect(ids).toContain('1.1:gaan');
    });
  });

});
