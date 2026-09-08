import { Injectable, OnDestroy, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  ResolveFn,
  RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';

/** Canonical origin for `og:url` — the demo's public home. */
export const SITE_ORIGIN = 'https://checkitout.app';

/**
 * Route-driven `<title>` — the greenfield port of the legacy SeoService's
 * title half (`${page} | ${site}`), turned declarative: every route's `title`
 * is a TRANSLATION KEY (page-h1 keys are reused wherever the wording fits,
 * gaps live under `seo.*`), and routes without one get the bare
 * `seo.site_title` — legacy behavior for transient auth hops.
 *
 * Since 2026-09 the same strategy carries the description: a route that
 * declares `data.description` (a translation key) gets `<meta
 * name="description">` and the Open Graph title/description/url, so a link to
 * the technical survey unfurls in a recruiter's mail client or chat with the
 * chapter's own words instead of nothing. Routes without one have the tags
 * removed, so a description never outlives the page it described.
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
  private readonly meta = inject(Meta);
  private readonly transloco = inject(TranslocoService);
  private sub?: Subscription;

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = this.buildTitle(snapshot);
    const descriptionKey = deepestDescription(snapshot.root);
    const url = `${SITE_ORIGIN}${snapshot.url.split('?')[0].split('#')[0]}`;
    this.sub?.unsubscribe();
    this.sub = this.transloco
      .selectTranslate<
        string[]
      >([key ?? 'seo.site_title', 'seo.site_title', descriptionKey ?? 'seo.site_title'])
      .subscribe(([page, site, description]) => {
        const full = key ? `${page} | ${site}` : site;
        this.title.setTitle(full);
        if (descriptionKey) {
          this.meta.updateTag({ name: 'description', content: description });
          this.meta.updateTag({ property: 'og:type', content: 'website' });
          this.meta.updateTag({ property: 'og:title', content: full });
          this.meta.updateTag({ property: 'og:description', content: description });
          this.meta.updateTag({ property: 'og:url', content: url });
          this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
        } else {
          for (const selector of [
            'name="description"',
            'property="og:type"',
            'property="og:title"',
            'property="og:description"',
            'property="og:url"',
            'name="twitter:card"',
          ]) {
            this.meta.removeTag(selector);
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

/** The deepest activated route's `data.description`, if any route declared one. */
function deepestDescription(route: ActivatedRouteSnapshot): string | undefined {
  let found: string | undefined;
  for (let r: ActivatedRouteSnapshot | null = route; r; r = r.firstChild) {
    const d = r.data['description'];
    if (typeof d === 'string') found = d;
  }
  return found;
}

/**
 * `/error/:type` title — the matching seo error entry; unknown types title
 * as 404 (the `**` catch-all redirects here with exactly that type).
 */
export const errorTitleKey: ResolveFn<string> = (route: ActivatedRouteSnapshot) => {
  const type = route.paramMap.get('type');
  return `seo.${type === '500' || type === '503' ? type : '404'}.title`;
};
