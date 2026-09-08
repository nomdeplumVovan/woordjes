import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Library } from './core/library';

const quizPage = () => import('./features/quiz/quiz-page').then((m) => m.QuizPage);

/** Без словаря учить нечего — ведём на импорт. */
const requireLibrary = () => {
  const library = inject(Library);
  const router = inject(Router);
  return library.chapterCount() > 0 ? true : router.createUrlTree(['/setup']);
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'chapters' },
  {
    path: 'setup',
    loadComponent: () => import('./features/setup/setup-page').then((m) => m.SetupPage),
  },
  // Без гарда: на новом устройстве копию могут восстановить до импорта словника.
  {
    path: 'backup',
    loadComponent: () => import('./features/backup/backup-page').then((m) => m.BackupPage),
  },
  {
    path: 'chapters',
    canActivate: [requireLibrary],
    loadComponent: () => import('./features/chapters/chapters').then((m) => m.Chapters),
  },
  // Повторение, артикли и глаголы — один экран, разные источники слов.
  { path: 'review', canActivate: [requireLibrary], loadComponent: quizPage },
  { path: 'recall', canActivate: [requireLibrary], loadComponent: quizPage },
  { path: 'articles', canActivate: [requireLibrary], loadComponent: quizPage },
  { path: 'verbs', canActivate: [requireLibrary], loadComponent: quizPage },
  { path: 'quiz/:chapterId', canActivate: [requireLibrary], loadComponent: quizPage },
  // Грамматический параграф: тренировать нечего, термины отдаются на чтение.
  {
    path: 'terms/:chapterId',
    canActivate: [requireLibrary],
    loadComponent: () => import('./features/terms/terms-page').then((m) => m.TermsPage),
  },
];
