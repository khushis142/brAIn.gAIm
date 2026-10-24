import { Routes } from '@angular/router';
import { Home } from './modules/home/home';
import { Settings } from './modules/settings/settings';
import {Upload} from './modules/upload/upload';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'upload', component: Upload },
  { path: 'settings', component: Settings },
  { path: '**', redirectTo: '' },
];
