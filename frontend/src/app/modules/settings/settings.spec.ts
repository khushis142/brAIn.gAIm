import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { Settings } from './settings';

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    httpTesting
      .expectOne(`${environment.apiBaseUrl}/users/me`)
      .flush({ id: 'user-id', username: 'alex', interests: '' });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
