import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(endpoint: string): Observable<T> {
    return this.http.get<T>(`${environment.apiBaseUrl}/${endpoint.replace(/^\//, '')}`);
  }
}
