import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'compose',
    pathMatch: 'full',
  },
  {
    path: 'compose',
    loadChildren: () =>
      import('./features/compose/compose.routes').then((m) => m.COMPOSE_ROUTES),
  },
];
