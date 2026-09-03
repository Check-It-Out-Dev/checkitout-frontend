/**
 * Hand-written clients for the subscription surface, which the BE hides
 * from the published OpenAPI contract (`@Hidden` on both controllers) even
 * though the endpoints are live at runtime — see hidden-models.ts for the
 * provenance story. Class names, method names and the single-request-
 * parameter envelopes replicate the last generated client 1:1 so
 * `SubscriptionApiService` / `SubscriptionWriteApi` (and their jest mocks)
 * keep working unchanged.
 *
 * Paths mirror `SubscriptionController` (always-on reads) and
 * `SubscriptionPaidController` (gated by `app.payments.enabled`), and ride
 * the same `/api` base path as the generated clients (same-origin cookies).
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, Optional, Inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BASE_PATH } from '../../api/variables';
import type {
  CheckoutSessionDtoOut,
  ConsentProofPayload,
  DowngradeRequestDtoIn,
  InvoiceRecordDtoOut,
  SubscriptionStatusDtoOut,
  UpgradeRequestDtoIn,
} from './hidden-models';

/** Always-on read endpoints (`SubscriptionController`). */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  protected basePath = '/api';

  constructor(
    protected httpClient: HttpClient,
    @Optional() @Inject(BASE_PATH) basePath: string | string[],
  ) {
    if (typeof basePath === 'string') {
      this.basePath = basePath;
    } else if (Array.isArray(basePath) && basePath.length > 0) {
      this.basePath = basePath[0];
    }
  }

  getStatus(): Observable<SubscriptionStatusDtoOut> {
    return this.httpClient.get<SubscriptionStatusDtoOut>(`${this.basePath}/subscription/status`);
  }

  getInvoices(): Observable<InvoiceRecordDtoOut[]> {
    return this.httpClient.get<InvoiceRecordDtoOut[]>(`${this.basePath}/subscription/invoices`);
  }
}

/** Paid write endpoints (`SubscriptionPaidController`, payments-flag gated). */
@Injectable({ providedIn: 'root' })
export class SubscriptionPaidService {
  protected basePath = '/api';

  constructor(
    protected httpClient: HttpClient,
    @Optional() @Inject(BASE_PATH) basePath: string | string[],
  ) {
    if (typeof basePath === 'string') {
      this.basePath = basePath;
    } else if (Array.isArray(basePath) && basePath.length > 0) {
      this.basePath = basePath[0];
    }
  }

  activateTrial(): Observable<unknown> {
    return this.httpClient.post(`${this.basePath}/subscription/trial/activate`, null);
  }

  recordConsent(requestParameters: {
    consentProofPayload: ConsentProofPayload;
  }): Observable<unknown> {
    return this.httpClient.post(
      `${this.basePath}/subscription/consent`,
      requestParameters.consentProofPayload,
    );
  }

  initiateUpgrade(requestParameters: {
    upgradeRequestDtoIn: UpgradeRequestDtoIn;
  }): Observable<CheckoutSessionDtoOut> {
    return this.httpClient.post<CheckoutSessionDtoOut>(
      `${this.basePath}/subscription/upgrade`,
      requestParameters.upgradeRequestDtoIn,
    );
  }

  requestDowngrade(requestParameters: {
    downgradeRequestDtoIn: DowngradeRequestDtoIn;
  }): Observable<unknown> {
    return this.httpClient.post(
      `${this.basePath}/subscription/downgrade`,
      requestParameters.downgradeRequestDtoIn,
    );
  }

  cancelDowngrade(): Observable<unknown> {
    return this.httpClient.post(`${this.basePath}/subscription/downgrade/cancel`, null);
  }

  createPortalSession(): Observable<{ [key: string]: string }> {
    return this.httpClient.post<{ [key: string]: string }>(
      `${this.basePath}/subscription/portal`,
      null,
    );
  }
}
