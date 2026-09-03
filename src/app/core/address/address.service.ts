import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AddressAPIService as GeneratedAddressApiService } from '../../api/api/address-api.api';
import type { AddressDtoIn } from '../../api/model/address-dto-in';
import type { AddressDtoOut } from '../../api/model/address-dto-out';

/**
 * Wrapper over the generated address API. Hides the codegen's odd
 * method names (`create12` / `patch12` / `delete12`) behind ergonomic
 * verbs and the `requestParameters` envelope.
 */
@Injectable({ providedIn: 'root' })
export class AddressApi {
  private readonly api = inject(GeneratedAddressApiService);

  createForUser(userId: number, dto: AddressDtoIn): Observable<AddressDtoOut> {
    return this.api.createAddressForUser({ userId, addressDtoIn: dto });
  }

  /** The user's primary address; errors (404) when none is set. */
  primaryForUser(userId: number): Observable<AddressDtoOut> {
    return this.api.getPrimaryAddressByUserId({ userId });
  }

  patch(id: number, dto: AddressDtoIn): Observable<AddressDtoOut> {
    // The BE PATCH inherits BaseController's `Map<String,Object>` body, so
    // the greenfield-branch spec types it as an untyped map. Keep the typed
    // AddressDtoIn surface here and cast once at the boundary; BE-side
    // schema strengthening is queued in the open-problems backlog.
    return this.api.patch12({ id, requestBody: dto as unknown as { [key: string]: object } });
  }

  remove(id: number): Observable<unknown> {
    return this.api.delete12({ ids: [id] });
  }
}
