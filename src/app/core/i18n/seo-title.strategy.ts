import { Injectable, OnDestroy, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';

/**
 * Route-driven `<title>` — the greenfield port of the legacy SeoService's
 * title half (`${page} | ${site}`), turned declarative: every route's `title`
 * is a TRANSLATION KEY (page-h1 keys are reused wherever the wording fits,
 * gaps live under `seo.*`), and routes without one get the bare
 * `seo.site_title` — legacy behavior for transient auth hops.
 *
 * The selectTranslate subscription stays open until the next navigation so a
 * language switch re-titles the current page live (what legacy got from
 * langChanges$, minus its split-on-'|' string surgery). Under SSR the active
 * language is preloaded by APP_INITIALIZER, so the first emission is
 * synchronous and the title serializes into the rendered HTML.
 */
@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy implements OnDestroy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private sub?: Subscription;

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = this.buildTitle(snapshot);
    this.sub?.unsubscribe();
    this.sub = key
      ? this.transloco
          .selectTranslate<string[]>([key, 'seo.site_title'])
          .subscribe(([page, site]) => this.title.setTitle(`${page} | ${site}`))
      : this.transloco
          .selectTranslate<string>('seo.site_title')
          .subscribe((site) => this.title.setTitle(site));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

/**
 * `/error/:type` title — the matching seo error entry; unknown types title
 * as 404 (the `**` catch-all redirects here with exactly that type).
 */
export const errorTitleKey: ResolveFn<string> = (route: ActivatedRouteSnapshot) => {
  const type = route.paramMap.get('type');
  return `seo.${type === '500' || type === '503' ? type : '404'}.title`;
};
