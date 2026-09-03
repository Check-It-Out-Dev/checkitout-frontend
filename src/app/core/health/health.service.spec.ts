import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HealthControllerService } from '../../api/api/health-controller.api';
import { HealthApiService } from './health.service';

describe('HealthApiService', () => {
  let service: HealthApiService;
  let api: { health: jest.Mock };

  beforeEach(() => {
    api = { health: jest.fn() };
    TestBed.configureTestingModule({
      providers: [HealthApiService, { provide: HealthControllerService, useValue: api }],
    });
    service = TestBed.inject(HealthApiService);
  });

  it('maps any successful response to true', () => {
    api.health.mockReturnValue(of('OK'));

    let result: boolean | undefined;
    service.isHealthy().subscribe((v) => (result = v));

    expect(result).toBe(true);
  });

  it('maps transport/5xx failure to false instead of erroring — the 503 page polls this as a plain boolean probe', () => {
    api.health.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

    let result: boolean | undefined;
    let errored = false;
    service.isHealthy().subscribe({
      next: (v) => (result = v),
      error: () => (errored = true),
    });

    expect(result).toBe(false);
    expect(errored).toBe(false);
  });
});
