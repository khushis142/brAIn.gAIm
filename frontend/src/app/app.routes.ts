import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { Gamehub } from './modules/gamehub/gamehub';
import { Home } from './modules/home/home';
import { Settings } from './modules/settings/settings';
import { Upload } from './modules/upload/upload';
import { Login } from './modules/user/login/login';
import { Register } from './modules/user/register/register';
import { UserService } from './modules/user/service/user-service';
import { VideoUpload } from './modules/video-upload/video-upload';
import { Wardrobe } from './modules/wardrobe/wardrobe';

const requireAuth = () => {
  const userService = inject(UserService);
  return userService.isAuthenticated() || inject(Router).parseUrl('/login');
};

export const routes: Routes = [
  { path: '', component: Home, canActivate: [requireAuth] },
  { path: 'gamehub', component: Gamehub, canActivate: [requireAuth] },
  { path: 'games', redirectTo: 'gamehub', pathMatch: 'full' },
  { path: 'knowledge', component: Upload, canActivate: [requireAuth] },
  { path: 'upload', redirectTo: 'knowledge', pathMatch: 'full' },
  { path: 'settings', component: Settings, canActivate: [requireAuth] },
  { path: 'video-upload', component: VideoUpload, canActivate: [requireAuth] },
  { path: 'wardrobe', component: Wardrobe, canActivate: [requireAuth] },
  { path: 'login', component: Login },
  { path: 'register', component: Register },
  { path: '**', redirectTo: '' },
];
