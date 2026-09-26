import { Routes } from '@angular/router';
import { adminGuard, authGuard, noAuthGuard } from './core/auth/auth.guards';
import { errorTitleKey } from './core/i18n/seo-title.strategy';

/**
 * Routes mirrored 1:1 from legacy `app.routes.ts` + lazy children. Paths kept
 * verbatim so cutover preserves user-facing URLs. As of 2026-09-02 every leaf
 * renders its REAL feature component — no PlaceholderComponent routes remain.
 *
 * Guard policy:
 * - `noAuthGuard` on /auth/{sign-in,sign-up*,forgot-password,confirmation-required}
 *   so a logged-in user is bounced to /collaborations/list when they navigate
 *   to a sign-in form
 * - No guard on /auth/{sign-out,verify-email,reset-password,action,success,
 *   2fa-setup,error,social/callback/:platform} — those are reachable from
 *   email links or post-auth flows where the session state varies
 * - `authGuard` on the entire authenticated section (admin, collaborations,
 *   user, company, subscription, home) — anonymous users redirect to
 *   /auth/sign-in
 */
export const routes: Routes = [
  // 1. Error page (no shell) — real 404/500/503 views (iter-54, P0 #8)
  {
    path: 'error/:type',
    title: errorTitleKey,
    loadComponent: () =>
      import('./feature/error-page/error-page.component').then((m) => m.ErrorPageComponent),
  },

  // 2. Auth (legacy: lazy `authentication.routes.ts`).
  // Uses the dedicated `AuthLayoutComponent` (2-column form + welcome banner)
  // matching the legacy `LayoutWithBannerComponent` — NOT the main app shell,
  // which would wrongly show the authenticated sidebar on /auth/*.
  {
    path: 'auth',
    loadComponent: () =>
      import('./layout/auth-layout/auth-layout.component').then((m) => m.AuthLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'sign-in' },
      {
        path: 'action',
        loadComponent: () =>
          import('./feature/auth/action-router/action-router.component').then(
            (m) => m.ActionRouterComponent,
          ),
      },
      {
        path: 'verify-email',
        title: 'seo.verify_email.title',
        loadComponent: () =>
          import('./feature/auth/verify-email/verify-email.component').then(
            (m) => m.VerifyEmailComponent,
          ),
      },
      {
        path: 'reset-password',
        title: 'auth.reset_password.form_title',
        loadComponent: () =>
          import('./feature/auth/reset-password/reset-password.component').then(
            (m) => m.ResetPasswordComponent,
          ),
      },
      {
        path: 'confirmation-required',
        title: 'auth.confirmation_required.title',
        canActivate: [noAuthGuard],
        loadComponent: () =>
          import('./feature/auth/confirmation-required/confirmation-required.component').then(
            (m) => m.ConfirmationRequiredComponent,
          ),
      },
      {
        path: 'forgot-password',
        title: 'auth.forgot_password.title',
        canActivate: [noAuthGuard],
        loadComponent: () =>
          import('./feature/auth/forgot-password/forgot-password.component').then(
            (m) => m.ForgotPasswordComponent,
          ),
      },
      {
        path: 'sign-in',
        title: 'seo.login.title',
        canActivate: [noAuthGuard],
        loadComponent: () =>
          import('./feature/auth/sign-in/sign-in.component').then((m) => m.SignInComponent),
      },
      {
        path: 'sign-up',
        pathMatch: 'full',
        title: 'seo.register.title',
        canActivate: [noAuthGuard],
        loadComponent: () =>
          import('./feature/auth/sign-up/sign-up-chooser.component').then(
            (m) => m.SignUpChooserComponent,
          ),
      },
      {
        path: 'sign-up/influencer',
        title: 'seo.register.title',
        canActivate: [noAuthGuard],
        loadComponent: () =>
          import('./feature/auth/sign-up/influencer-sign-up.component').then(
            (m) => m.InfluencerSignUpComponent,
          ),
      },
      {
        path: 'sign-up/business',
        title: 'seo.register.title',
        canActivate: [noAuthGuard],
        loadComponent: () =>
          import('./feature/auth/sign-up/business-sign-up.component').then(
            (m) => m.BusinessSignUpComponent,
          ),
      },
      {
        path: 'sign-out',
        loadComponent: () =>
          import('./feature/auth/sign-out/sign-out.component').then((m) => m.SignOutComponent),
      },
      {
        path: 'social/callback/:platform',
        loadComponent: () =>
          import('./feature/auth/social-callback/social-callback.component').then(
            (m) => m.SocialCallbackComponent,
          ),
      },
      {
        path: 'success',
        loadComponent: () =>
          import('./feature/auth/auth-success/auth-success.component').then(
            (m) => m.AuthSuccessComponent,
          ),
      },
      {
        path: '2fa-setup',
        title: 'auth.two_factor_setup.title',
        loadComponent: () =>
          import('./feature/auth/two-factor-setup/two-factor-setup.component').then(
            (m) => m.TwoFactorSetupComponent,
          ),
      },
      {
        // Email-action / auth failure landing (?error=consent_required branches).
        path: 'error',
        loadComponent: () =>
          import('./feature/auth/auth-error/auth-error.component').then(
            (m) => m.AuthErrorComponent,
          ),
      },
    ],
  },

  // 3. Public landing — bare (no LayoutComponent wrap; landing has its own
  // marketing chrome with hero + features + sign-in footer link).
  {
    path: '',
    pathMatch: 'full',
    title: 'seo.homepage.title',
    loadComponent: () =>
      import('./feature/landing/landing.component').then((m) => m.LandingComponent),
  },

  // 3b. Technical survey — "Startup in the box", the public README of the
  // platform (ported from the legacy demo build; URL surface mirrored 1:1).
  // Hub + five chapter pages, all lazy standalone.
  {
    path: 'technical-survey',
    children: [
      {
        path: '',
        title: 'landing.survey.title',
        loadComponent: () =>
          import('./feature/survey/survey-hub.component').then((m) => m.SurveyHubComponent),
      },
      {
        path: 'platform',
        title: 'landing.survey.chapters.platform.question',
        loadComponent: () =>
          import('./feature/survey/chapters/platform-chapter.component').then(
            (m) => m.PlatformChapterComponent,
          ),
      },
      {
        path: 'security',
        title: 'landing.survey.chapters.security.question',
        loadComponent: () =>
          import('./feature/survey/chapters/security-chapter.component').then(
            (m) => m.SecurityChapterComponent,
          ),
      },
      {
        path: 'compliance',
        title: 'landing.survey.chapters.compliance.question',
        loadComponent: () =>
          import('./feature/survey/chapters/compliance-chapter.component').then(
            (m) => m.ComplianceChapterComponent,
          ),
      },
      {
        path: 'operations',
        title: 'landing.survey.chapters.operations.question',
        loadComponent: () =>
          import('./feature/survey/chapters/operations-chapter.component').then(
            (m) => m.OperationsChapterComponent,
          ),
      },
      {
        path: 'engineering',
        title: 'landing.survey.chapters.engineering.question',
        loadComponent: () =>
          import('./feature/survey/chapters/engineering-chapter.component').then(
            (m) => m.EngineeringChapterComponent,
          ),
      },
    ],
  },

  // 3c. CodeMap & AI application — the public story of the graph-navigator
  // model (interactive replays of real recorded sessions, the training
  // journey, the architectural decisions). Same bare marketing chrome as
  // the landing and the survey.
  {
    path: 'codemap',
    title: 'landing.codemap.title',
    loadComponent: () =>
      import('./feature/codemap/codemap-page.component').then((m) => m.CodemapPageComponent),
  },

  // 3d. Demo hub — "step into a role" (demo build only; the hub gates
  // itself on isDemoMode and shows a plain pointer elsewhere).
  {
    path: 'demo',
    title: 'demo.hub.title',
    loadComponent: () =>
      import('./feature/demo/demo-hub.component').then((m) => m.DemoHubComponent),
  },
  {
    // Legacy demo vignette: collaborate straight from a campaign card,
    // played as the influencer persona (dark inverse page).
    path: 'demo/collaborate',
    title: 'demo.sandboxes.influencer-collab.title',
    loadComponent: () =>
      import('./feature/demo/collab-hero.component').then((m) => m.CollabHeroComponent),
  },

  // 3c. Legacy /welcome splash — superseded by the technical survey on the
  // demo build; keep the URL working (mirrors feature/demo).
  { path: 'welcome', redirectTo: 'technical-survey', pathMatch: 'full' },

  // 4. Team (lazy in legacy → flattened here). Public marketing page —
  // bare + its own marketing toolbar, like the landing (iter-55, P0 #8).
  {
    path: 'team',
    title: 'seo.team.title',
    loadComponent: () => import('./feature/team/team.component').then((m) => m.TeamComponent),
  },

  // 5. EU Grants — public marketing page, bare + its own marketing toolbar
  // (iter-56, P0 #8).
  {
    path: 'grants',
    title: 'seo.grants.title',
    loadComponent: () => import('./feature/grants/grants.component').then((m) => m.GrantsComponent),
  },

  // 6. Support (legacy: lazy `support.routes.ts`). Home (iter-57) and the
  // public ticket form (iter-58a) are marketing-chrome pages — bare + their
  // own toolbar, one coherent public journey. The personal/admin ticket
  // routes keep the app layout until their port.
  {
    path: 'support',
    pathMatch: 'full',
    title: 'seo.support.title',
    loadComponent: () =>
      import('./feature/support/support.component').then((m) => m.SupportComponent),
  },
  { path: 'support/tickets', pathMatch: 'full', redirectTo: '/support/tickets/create' },
  {
    path: 'support/tickets/create',
    title: 'support.tickets.create.title',
    loadComponent: () =>
      import('./feature/support/create-ticket/create-ticket.component').then(
        (m) => m.CreateTicketComponent,
      ),
  },
  {
    path: 'support/tickets/status',
    title: 'support.tickets.status.title',
    loadComponent: () =>
      import('./feature/support/ticket-status/ticket-status.component').then(
        (m) => m.TicketStatusComponent,
      ),
  },
  {
    path: 'support',
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      {
        path: 'tickets',
        // Legacy guards my-tickets specifically (create/status stay public).
        children: [
          {
            path: 'my-tickets',
            title: 'support.tickets.my.title',
            loadComponent: () =>
              import('./feature/support/user-tickets-list/user-tickets-list.component').then(
                (m) => m.UserTicketsListComponent,
              ),
            canActivate: [authGuard],
          },
        ],
      },
      {
        // BE enforces the ADMIN role (403); adminGuard keeps non-admins from
        // opening the queue with every data call failing.
        path: 'admin/tickets',
        canActivate: [authGuard, adminGuard],
        canActivateChild: [authGuard, adminGuard],
        children: [
          {
            path: '',
            title: 'support.admin.tickets.title',
            loadComponent: () =>
              import('./feature/support/admin-tickets-list/admin-tickets-list.component').then(
                (m) => m.AdminTicketsListComponent,
              ),
          },
          {
            path: ':id',
            title: 'support.admin.ticket_detail.title',
            loadComponent: () =>
              import('./feature/support/admin-ticket-detail/admin-ticket-detail.component').then(
                (m) => m.AdminTicketDetailComponent,
              ),
          },
        ],
      },
    ],
  },

  // 7. UI component samples — legacy hosted the dev-only commercial UI kit here.
  // The greenfield equivalent IS the sandbox fixture index (every component
  // state, faker-seeded, snapshot-backed), so the URL redirects there instead
  // of duplicating a second component gallery.
  { path: 'ui-component-samples', redirectTo: '__sandbox' },

  // 8-13. Authenticated section (legacy: nested under shared LayoutComponent)
  {
    path: '',
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: 'home', redirectTo: 'collaborations/list', pathMatch: 'full' },

      // admin (lazy)
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          {
            // Admin lookup-value editor (BE authorizes ADMIN on mutations).
            path: 'dictionary',
            title: 'admin_dictionary.title',
            loadComponent: () =>
              import('./feature/admin/dictionary.component').then(
                (m) => m.AdminDictionaryComponent,
              ),
          },
        ],
      },

      // collaborations (lazy)
      {
        path: 'collaborations',
        children: [
          {
            path: 'list',
            title: 'opportunities.list.title',
            loadComponent: () =>
              import('./feature/opportunities/opportunities-list.component').then(
                (m) => m.OpportunitiesListComponent,
              ),
          },
          {
            path: 'my-campaigns',
            title: 'opportunities.dashboard.title',
            loadComponent: () =>
              import('./feature/opportunities/my-campaigns.component').then(
                (m) => m.MyCampaignsComponent,
              ),
          },
          {
            path: 'create',
            title: 'opportunities.form.title_create',
            loadComponent: () =>
              import('./feature/opportunities/opportunity-form.component').then(
                (m) => m.OpportunityFormComponent,
              ),
          },
          {
            path: 'edit/:id',
            title: 'opportunities.form.title_edit',
            loadComponent: () =>
              import('./feature/opportunities/opportunity-form.component').then(
                (m) => m.OpportunityFormComponent,
              ),
          },
          // Journey 5 — collaboration dashboard. `dashboard` mirrors legacy
          // tab 0 (in-progress); the two tab routes share one component
          // driven by route data (CollaborationDashboardComponent docs).
          { path: 'dashboard', redirectTo: 'in-progress' },
          {
            path: 'in-progress',
            title: 'collaborations.dashboard.title',
            data: { collabTab: 'in-progress' },
            loadComponent: () =>
              import('./feature/collaborations/collaboration-dashboard.component').then(
                (m) => m.CollaborationDashboardComponent,
              ),
          },
          {
            path: 'registrations',
            title: 'applied_opportunities.list.title',
            loadComponent: () =>
              import('./feature/applied-opportunities/applied-opportunities-list.component').then(
                (m) => m.AppliedOpportunitiesListComponent,
              ),
          },
          {
            path: 'registrations/:id',
            title: 'seo.application_detail.title',
            loadComponent: () =>
              import('./feature/applied-opportunities/applied-opportunity-detail.component').then(
                (m) => m.AppliedOpportunityDetailComponent,
              ),
          },
          {
            path: 'registrations/:id/content',
            title: 'seo.content_submission.title',
            loadComponent: () =>
              import('./feature/applied-opportunities/content-submission.component').then(
                (m) => m.ContentSubmissionComponent,
              ),
          },
          {
            path: ':id/applicants',
            title: 'opportunities.applicants.title',
            loadComponent: () =>
              import('./feature/opportunities/campaign-applicants.component').then(
                (m) => m.CampaignApplicantsComponent,
              ),
          },
          {
            path: 'applications/:id/review',
            title: 'opportunities.review.title',
            loadComponent: () =>
              import('./feature/opportunities/content-review.component').then(
                (m) => m.ContentReviewComponent,
              ),
          },
          {
            path: 'finished',
            title: 'collaborations.dashboard.title',
            data: { collabTab: 'finished' },
            loadComponent: () =>
              import('./feature/collaborations/collaboration-dashboard.component').then(
                (m) => m.CollaborationDashboardComponent,
              ),
          },
          { path: 'ratings', redirectTo: 'finished' },
          { path: 'history', redirectTo: 'finished' },
          { path: 'influencers', redirectTo: 'dashboard' },
          { path: 'companies', redirectTo: 'dashboard' },
          {
            path: ':id',
            title: 'seo.campaign.title',
            loadComponent: () =>
              import('./feature/opportunities/opportunity-detail.component').then(
                (m) => m.OpportunityDetailComponent,
              ),
          },
        ],
      },

      // user (lazy)
      {
        path: 'user',
        children: [
          {
            // Journey 8 — admin user-management table (BE authorizes ADMIN).
            path: 'list',
            canActivate: [adminGuard],
            title: 'admin_users.title',
            loadComponent: () =>
              import('./feature/admin/user-list.component').then((m) => m.AdminUserListComponent),
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./feature/settings/settings-layout.component').then(
                (m) => m.SettingsLayoutComponent,
              ),
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'account' },
              {
                path: 'account',
                title: 'settings.tabs.account',
                loadComponent: () =>
                  import('./feature/profile/profile-view.component').then(
                    (m) => m.ProfileViewComponent,
                  ),
              },
              {
                path: 'preferences',
                title: 'settings.tabs.preferences',
                loadComponent: () =>
                  import('./feature/preferences/preferences.component').then(
                    (m) => m.PreferencesComponent,
                  ),
              },
              {
                path: 'addresses',
                title: 'settings.tabs.addresses',
                loadComponent: () =>
                  import('./feature/addresses/addresses.component').then(
                    (m) => m.AddressesComponent,
                  ),
              },
              {
                path: 'security',
                title: 'settings.tabs.security',
                loadComponent: () =>
                  import('./feature/settings/security-settings.component').then(
                    (m) => m.SecuritySettingsComponent,
                  ),
              },
              {
                path: 'social',
                title: 'settings.tabs.social',
                loadComponent: () =>
                  import('./feature/settings/social-connections-settings.component').then(
                    (m) => m.SocialConnectionsSettingsComponent,
                  ),
              },
              {
                path: 'plan-billing',
                title: 'settings.tabs.plan_billing',
                loadComponent: () =>
                  import('./feature/plan-billing/plan-billing.component').then(
                    (m) => m.PlanBillingComponent,
                  ),
              },
            ],
          },
        ],
      },

      // company (lazy)
      {
        path: 'company',
        children: [
          {
            // NIP→GUS/KRS/CEIDG onboarding — the FE surface of the flow the
            // registry BDD oracle proves (lookup → confirm → auto-activation).
            path: 'setup',
            title: 'company_setup.title',
            loadComponent: () =>
              import('./feature/company/company-setup.component').then(
                (m) => m.CompanySetupComponent,
              ),
          },
        ],
      },

      // Legacy /subscription paths — greenfield merged subscription
      // management into /user/settings/plan-billing. These redirects
      // keep cutover-day deep links (Stripe return URLs, bookmarked
      // billing pages) working. See memory project_legacy_settings_url_split.md.
      {
        path: 'subscription',
        children: [
          { path: '', pathMatch: 'full', redirectTo: '/user/settings/plan-billing' },
          { path: 'success', redirectTo: '/user/settings/plan-billing' },
          { path: 'cancel', redirectTo: '/user/settings/plan-billing' },
        ],
      },
      // Legacy /plan-billing top-level URL — caught by live-Chrome smoke
      // 2026-05-12 (#199). Bookmark/email-deep-link parity.
      { path: 'plan-billing', pathMatch: 'full', redirectTo: '/user/settings/plan-billing' },
    ],
  },

  // Sandbox harness — dev-only fixture viewer (no shell, lazy-loaded so it
  // adds zero bytes to the production initial bundle).
  {
    path: '__sandbox',
    title: 'seo.sandbox.title',
    loadChildren: () => import('./sandbox/sandbox.routes').then((m) => m.SANDBOX_ROUTES),
  },

  // Catch-all → 404
  { path: '**', redirectTo: 'error/404' },
];
