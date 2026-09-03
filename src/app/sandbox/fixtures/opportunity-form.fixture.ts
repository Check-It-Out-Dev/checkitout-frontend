import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, of } from 'rxjs';
import type { ContentTypeDtoOut } from '../../api/model/content-type-dto-out';
import type { CurrencyDtoOut } from '../../api/model/currency-dto-out';
import type { PartnershipOpportunityDtoOut } from '../../api/model/partnership-opportunity-dto-out';
import type { PlatformDto } from '../../api/model/platform-dto';
import type { ServiceTypeDtoOut } from '../../api/model/service-type-dto-out';
import { OpportunityApiService } from '../../core/opportunities/opportunity.service';
import { OpportunityDictionariesApiService } from '../../core/opportunities/opportunity-dictionaries.service';
import { OpportunityFormComponent } from '../../feature/opportunities/opportunity-form.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * Campaign create/edit form fixtures. Mode is driven by the `:id` route
 * param, so each state gets its own ActivatedRoute stub. Submit paths
 * (saving / validation / session-expiry) are interaction-only — the three
 * init-reachable renders below are the byte-stable surface.
 */

function routeWithId(id: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: convertToParamMap(id ? { id } : {}) },
  } as unknown as ActivatedRoute;
}

const EDIT_DTO: PartnershipOpportunityDtoOut = {
  id: 1,
  name: 'sneaker-drop-2026',
  title: 'Spring sneaker drop — long-form review',
  city: 'Warszawa',
  details: 'A 15-minute long-form video reviewing the new sneaker drop.',
  requirements: 'Minimum 50k followers, sports or streetwear niche.',
  compensationType: {
    value: 'CASH',
    label: 'Cash',
  } as PartnershipOpportunityDtoOut['compensationType'],
  compensationAmountMin: 1500,
  compensationAmountMax: 3000,
  active: true,
  address: {
    id: 41,
    street: 'Marszałkowska 1/10',
    city: 'Warszawa',
    postalCode: '00-624',
    country: 'Polska',
  } as PartnershipOpportunityDtoOut['address'],
  // Deterministic inline SVGs so the photo thumbnails baseline byte-stably
  // (no network fetch, no raster variance).
  photos: [
    {
      id: 61,
      url:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="%23e8b4a0"/></svg>',
        ),
      orderNumber: 0,
      isCover: true,
    },
    {
      id: 62,
      url:
        'data:image/svg+xml;utf8,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="%232d3e50"/></svg>',
        ),
      orderNumber: 1,
      isCover: false,
    },
  ] as PartnershipOpportunityDtoOut['photos'],
};

/** Deterministic FK dictionaries so the classification selects render
 *  identically across regens (no live HTTP from the sandbox). */
class StubDictionaries {
  platforms(): Observable<PlatformDto[]> {
    return of([
      { id: 1, name: 'Instagram', active: true, contentTypes: new Set() },
      { id: 2, name: 'TikTok', active: true, contentTypes: new Set() },
    ] as PlatformDto[]);
  }
  contentTypes(): Observable<ContentTypeDtoOut[]> {
    return of([
      { id: 11, name: 'Reel' },
      { id: 12, name: 'Post' },
      { id: 13, name: 'Story' },
    ]);
  }
  serviceTypes(): Observable<ServiceTypeDtoOut[]> {
    return of([
      { id: 21, name: 'Product placement' },
      { id: 22, name: 'Review' },
    ]);
  }
  currencies(): Observable<CurrencyDtoOut[]> {
    return of([
      { id: 31, name: 'Polish Złoty', isoCode: 'PLN' },
      { id: 32, name: 'Euro', isoCode: 'EUR' },
    ]);
  }
}

class StubGetByIdLoaded {
  getById(): Observable<PartnershipOpportunityDtoOut> {
    return of(EDIT_DTO);
  }
}

class StubGetByIdNotFound {
  getById(): Observable<PartnershipOpportunityDtoOut> {
    return new Observable<PartnershipOpportunityDtoOut>((sub) => sub.error({ status: 404 }));
  }
}

export const OPPORTUNITY_FORM_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'opportunity-form-create',
    label: 'Campaign form · create mode (blank)',
    component: OpportunityFormComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId(null) },
      { provide: OpportunityDictionariesApiService, useClass: StubDictionaries },
    ],
  },
  {
    id: 'opportunity-form-edit',
    label: 'Campaign form · edit mode, prefilled from DtoOut',
    component: OpportunityFormComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('1') },
      { provide: OpportunityApiService, useClass: StubGetByIdLoaded },
      { provide: OpportunityDictionariesApiService, useClass: StubDictionaries },
    ],
  },
  {
    id: 'opportunity-form-not-found',
    label: 'Campaign form · edit target 404',
    component: OpportunityFormComponent,
    providers: [
      { provide: ActivatedRoute, useValue: routeWithId('999') },
      { provide: OpportunityApiService, useClass: StubGetByIdNotFound },
      { provide: OpportunityDictionariesApiService, useClass: StubDictionaries },
    ],
  },
];
