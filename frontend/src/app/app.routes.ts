import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { Home } from './modules/home/home';
import { Settings } from './modules/settings/settings';
import { Upload } from './modules/upload/upload';
import { Login } from './modules/user/login/login';
import { Register } from './modules/user/register/register';
import { UserService } from './modules/user/service/user-service';

const requireAuth = () => {
  const userService = inject(UserService);
  return userService.isAuthenticated() || inject(Router).parseUrl('/login');
};

export const routes: Routes = [
  { path: '', component: Home, canActivate: [requireAuth] },
  { path: 'upload', component: Upload, canActivate: [requireAuth] },
  { path: 'settings', component: Settings, canActivate: [requireAuth] },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: '**', redirectTo: '' },
];
