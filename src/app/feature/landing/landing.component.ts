import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoModule, TranslocoService } from '@ngneat/transloco';
import { CookieBannerComponent } from '../../shared/components/cookie-banner/cookie-banner.component';
import { HeroIllustrationComponent } from './hero-illustration/hero-illustration.component';
import { InteractiveDashboardPreviewComponent } from './interactive-dashboard-preview/interactive-dashboard-preview.component';
import { MarketingToolbarComponent } from './marketing-toolbar/marketing-toolbar.component';
import { OssStorySectionComponent } from './oss-story-section/oss-story-section.component';

interface FeatureCard {
  readonly icon: string;
  readonly titleKey: string;
  readonly bodyKey: string;
}

interface BenefitCard {
  readonly icon: string;
  readonly titleKey: string;
  /** i18n key whose value is an array of bullet strings. The transloco pipe
   * returns the array; the template iterates with `@for ... of $any(key|transloco)`. */
  readonly itemsKeyBase: string;
}

interface ProcessStep {
  readonly stepNumber: number;
  readonly icon: string;
  readonly titleKey: string;
  readonly descriptionKey: string;
  /** Legacy per-step effort estimate in minutes ('15' | '10' | '45' | '5'). */
  readonly timeEstimate: string;
}

interface CampaignExample {
  readonly id: string;
  readonly icon: string;
  readonly accent: 'rose' | 'emerald' | 'sky';
  readonly categoryKey: string;
  readonly titleKey: string;
  readonly compensationKey: string;
  readonly followersKey: string;
  readonly locationKey: string;
  readonly descriptionKey: string;
}

interface PlanBenefitBox {
  readonly titleKey: string;
  readonly nameKey: string;
  readonly descKey: string;
}

interface PricingPlan {
  readonly id: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  /** Monthly price in PLN, display form ('0' | '29' | '99') — the numbers are
   * product facts, not translations, so they live here like in legacy. */
  readonly price: string;
  /** Per-day approximation for paid plans (legacy: (price/30).toFixed(1)). */
  readonly perDay?: string;
  readonly campaignsKey: string;
  readonly campaignsCountKey: string;
  readonly ctaKey: string;
  readonly badgeKey?: string;
  readonly highlight?: boolean;
  /** "Everything in the tier below, plus:" — shown above the plan's own benefits. */
  readonly inheritsKey?: string;
  readonly benefitBoxes?: readonly PlanBenefitBox[];
}

/**
 * Public landing page at `/`. Stage 5 / P3 — marketing port.
 *
 * Sections (top to bottom): hero, stats strip, OSS story (GitHub/MIT +
 * survey/demo journey teasers + team), three feature cards, campaign
 * examples, three benefit columns, four-step "how it works" timeline,
 * pricing, testimonials, FAQ, CTA strip, footer. Renders bare (no
 * sidenav) — public visitors see only the marketing surface, separate
 * from the authenticated shell.
 *
 * Content is i18n-driven from `landing.*` keys ported from legacy.
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      /* Tailwind's preflight is off in this app (it clashes with Material), so
         the user agent's margins on headings, paragraphs and lists were still
         in force here — every card on the page stacked its own \`gap-*\` on
         top of 1em above and below each \`p\`, 0.83em around each \`h2\`,
         1em around each \`h3\`. The pricing cards were the worst of it: a plan
         card measured 1023 px with 357 px of nothing above its button. This is
         the part of preflight the templates were written against; spacing is
         now only what a class says. */
      /* The type reset (UA block margins off h1-h6, p, ul, ol) lives in
         styles.scss as "app-landing h2 { margin-block: 0 }" and friends.
         Here, emulated encapsulation would turn "p" into "p[_ngcontent-x]"
         (0,1,1), which beat every mt-* and mx-auto utility (0,1,0) on a
         heading or paragraph: the CTA strip's title sat at the left edge of a
         wide screen and the mock card's labels had no room above them. */

      .landing-title-highlight {
        background-image: linear-gradient(to right, #2563eb, #06b6d4);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
      }
    `,
  ],
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    TranslocoModule,
    MarketingToolbarComponent,
    HeroIllustrationComponent,
    InteractiveDashboardPreviewComponent,
    OssStorySectionComponent,
    CookieBannerComponent,
  ],
  templateUrl: './landing.component.html',
})
export class LandingComponent {
  private readonly transloco = inject(TranslocoService);

  readonly currentYear = new Date().getFullYear();

  /** The legacy CTA video is a Polish-language walkthrough — PL sessions only. */
  readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  /** Click-to-load facade: no third-party iframe until the visitor asks. */
  readonly showVideo = signal(false);

  readonly features: readonly FeatureCard[] = [
    {
      icon: 'campaign',
      titleKey: 'landing.features.create_campaigns.title',
      bodyKey: 'landing.features.create_campaigns.body',
    },
    {
      icon: 'people',
      titleKey: 'landing.features.find_creators.title',
      bodyKey: 'landing.features.find_creators.body',
    },
    {
      icon: 'paid',
      titleKey: 'landing.features.measure_results.title',
      bodyKey: 'landing.features.measure_results.body',
    },
  ];

  readonly benefits: readonly BenefitCard[] = [
    {
      icon: 'savings',
      titleKey: 'landing.benefits.cards.time_money.title',
      itemsKeyBase: 'landing.benefits.cards.time_money.items',
    },
    {
      icon: 'verified_user',
      titleKey: 'landing.benefits.cards.effective_collaboration.title',
      itemsKeyBase: 'landing.benefits.cards.effective_collaboration.items',
    },
    {
      icon: 'tune',
      titleKey: 'landing.benefits.cards.better_targeting.title',
      itemsKeyBase: 'landing.benefits.cards.better_targeting.items',
    },
  ];

  readonly steps: readonly ProcessStep[] = [
    {
      stepNumber: 1,
      timeEstimate: '15',
      icon: 'flag',
      titleKey: 'landing.how_it_works.steps.step1.title',
      descriptionKey: 'landing.how_it_works.steps.step1.description',
    },
    {
      stepNumber: 2,
      timeEstimate: '10',
      icon: 'inbox',
      titleKey: 'landing.how_it_works.steps.step2.title',
      descriptionKey: 'landing.how_it_works.steps.step2.description',
    },
    {
      stepNumber: 3,
      timeEstimate: '45',
      icon: 'handshake',
      titleKey: 'landing.how_it_works.steps.step3.title',
      descriptionKey: 'landing.how_it_works.steps.step3.description',
    },
    {
      stepNumber: 4,
      timeEstimate: '5',
      icon: 'analytics',
      titleKey: 'landing.how_it_works.steps.step4.title',
      descriptionKey: 'landing.how_it_works.steps.step4.description',
    },
  ];

  /** Mockup data for the how-it-works vignettes (legacy content, PL market). */
  readonly mockApplications = [
    { handle: '@kasia_beauty', followers: '12 000' },
    { handle: '@anna_lifestyle', followers: '25 000' },
    { handle: '@marta_travel', followers: '18 500' },
  ] as const;

  readonly mockMetrics = [
    { value: '50.2K', labelKey: 'landing.how_it_works.metrics.views' },
    { value: '2.5K', labelKey: 'landing.how_it_works.metrics.likes' },
    { value: '45.8K', labelKey: 'landing.how_it_works.metrics.reach' },
    { value: '156', labelKey: 'landing.how_it_works.metrics.saves' },
  ] as const;

  readonly timelineKeys = ['select', 'agree', 'create', 'review'] as const;

  readonly campaignExamples: readonly CampaignExample[] = [
    {
      id: 'coffee_shop',
      icon: 'coffee',
      accent: 'rose',
      categoryKey: 'landing.campaign_examples.cards.coffee_shop.category',
      titleKey: 'landing.campaign_examples.cards.coffee_shop.title',
      compensationKey: 'landing.campaign_examples.cards.coffee_shop.compensation_value',
      followersKey: 'landing.campaign_examples.cards.coffee_shop.followers_value',
      locationKey: 'landing.campaign_examples.cards.coffee_shop.location_value',
      descriptionKey: 'landing.campaign_examples.cards.coffee_shop.description',
    },
    {
      id: 'zero_waste',
      icon: 'eco',
      accent: 'emerald',
      categoryKey: 'landing.campaign_examples.cards.zero_waste.category',
      titleKey: 'landing.campaign_examples.cards.zero_waste.title',
      compensationKey: 'landing.campaign_examples.cards.zero_waste.compensation_value',
      followersKey: 'landing.campaign_examples.cards.zero_waste.followers_value',
      locationKey: 'landing.campaign_examples.cards.zero_waste.location_value',
      descriptionKey: 'landing.campaign_examples.cards.zero_waste.description',
    },
    {
      id: 'summer_sports',
      icon: 'sports_tennis',
      accent: 'sky',
      categoryKey: 'landing.campaign_examples.cards.summer_sports.category',
      titleKey: 'landing.campaign_examples.cards.summer_sports.title',
      compensationKey: 'landing.campaign_examples.cards.summer_sports.compensation_value',
      followersKey: 'landing.campaign_examples.cards.summer_sports.followers_value',
      locationKey: 'landing.campaign_examples.cards.summer_sports.location_value',
      descriptionKey: 'landing.campaign_examples.cards.summer_sports.description',
    },
  ];

  readonly pricingPlans: readonly PricingPlan[] = [
    {
      id: 'starter',
      nameKey: 'landing.pricing.plans.starter.name',
      descriptionKey: 'landing.pricing.plans.starter.description',
      price: '0',
      campaignsKey: 'landing.pricing.plans.starter.campaigns',
      campaignsCountKey: 'landing.pricing.plans.starter.campaigns_count',
      ctaKey: 'landing.pricing.plans.starter.cta',
    },
    {
      id: 'growth',
      nameKey: 'landing.pricing.plans.growth.name',
      descriptionKey: 'landing.pricing.plans.growth.description',
      price: '29',
      perDay: '1.0',
      campaignsKey: 'landing.pricing.plans.growth.campaigns',
      campaignsCountKey: 'landing.pricing.plans.growth.campaigns_count',
      ctaKey: 'landing.pricing.plans.growth.cta',
      badgeKey: 'landing.pricing.plans.growth.badge',
      highlight: true,
      benefitBoxes: [
        {
          titleKey: 'landing.pricing.plans.growth.benefits.title',
          nameKey: 'landing.pricing.plans.growth.benefits.priority_support',
          descKey: 'landing.pricing.plans.growth.benefits.priority_support_desc',
        },
      ],
    },
    {
      id: 'premium',
      nameKey: 'landing.pricing.plans.premium.name',
      descriptionKey: 'landing.pricing.plans.premium.description',
      price: '99',
      perDay: '3.3',
      campaignsKey: 'landing.pricing.plans.premium.campaigns',
      campaignsCountKey: 'landing.pricing.plans.premium.campaigns_count',
      ctaKey: 'landing.pricing.plans.premium.cta',
      inheritsKey: 'landing.pricing.plans.premium.includes_growth',
      benefitBoxes: [
        {
          titleKey: 'landing.pricing.plans.premium.premium_benefits.title',
          nameKey: 'landing.pricing.plans.premium.premium_benefits.brand_badge',
          descKey: 'landing.pricing.plans.premium.premium_benefits.brand_badge_desc',
        },
      ],
    },
  ];
}
