import { Routes } from '@angular/router';

export const COMPOSE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./compose-shell/compose-shell').then((m) => m.ComposeShell),
    title: 'Compose — Dev Editor',
  },
];
