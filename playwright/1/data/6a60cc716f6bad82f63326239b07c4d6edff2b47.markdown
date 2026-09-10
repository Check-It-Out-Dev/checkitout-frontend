# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: integration/flows/notification-lifecycle.spec.ts >> @notification-lifecycle — port of notification-e2e.feature >> @notification-preferences disabled prefs suppress APPLICATION_RECEIVED
- Location: e2e-tests/integration/flows/notification-lifecycle.spec.ts:316:7

# Error details

```
Error: apply should succeed, got 401

expect(received).toBeLessThan(expected)

Expected: < 300
Received:   401
```

# Test source

```ts
  255 |     expect(markAllRes.status(), 'mark-all-read should be 200').toBe(200);
  256 | 
  257 |     const afterAllRes = await api(page, 'GET', '/notifications/unread/count');
  258 |     expect(afterAllRes.status()).toBe(200);
  259 |     const afterAllCount = ((await afterAllRes.json()) as UnreadCountResponse).count ?? -1;
  260 |     expect(afterAllCount, 'unread count should be 0 after mark-all-read').toBe(0);
  261 | 
  262 |     // Phase 8: Archive notification → 204 → removed from list
  263 |     const archiveRes = await api(page, 'DELETE', `/notifications/${notifId}`);
  264 |     expect(
  265 |       [200, 204].includes(archiveRes.status()),
  266 |       `archive should be 200/204, got ${archiveRes.status()}`,
  267 |     ).toBe(true);
  268 | 
  269 |     const afterArchiveRes = await api(page, 'GET', '/notifications?page=0&size=10');
  270 |     expect(afterArchiveRes.status()).toBe(200);
  271 |     const afterArchive = (await afterArchiveRes.json()) as PageNotificationDtoOut;
  272 |     const remaining: NotificationDtoOut[] = afterArchive.content ?? [];
  273 |     expect(
  274 |       remaining.find((n) => n.id === notifId),
  275 |       `archived notification ${notifId} should NOT be in list anymore`,
  276 |     ).toBeUndefined();
  277 | 
  278 |     // Phase 9: Cross-user isolation — INFLUENCER should NOT see COMPANY's notif
  279 |     const inf2 = await seedInfluencerContext(browser);
  280 |     try {
  281 |       const infListRes = await api(inf2.page, 'GET', '/notifications?page=0&size=10');
  282 |       expect(infListRes.status()).toBe(200);
  283 |       const infList = (await infListRes.json()) as PageNotificationDtoOut;
  284 |       const infItems: NotificationDtoOut[] = infList.content ?? [];
  285 |       // A fresh INFLUENCER actor would have 0 items related to this test's
  286 |       // campaign id (campaigns notify the COMPANY owner, not influencers).
  287 |       expect(
  288 |         infItems.find((n) => n.id === notifId),
  289 |         `INFLUENCER should NOT see COMPANY's notification ${notifId}`,
  290 |       ).toBeUndefined();
  291 |     } finally {
  292 |       await inf2.context.close();
  293 |     }
  294 |   });
  295 | 
  296 |   // --------------------------------------------------------------------
  297 |   // Scenario 2: Preferences-gated suppression
  298 |   // --------------------------------------------------------------------
  299 |   // --------------------------------------------------------------------
  300 |   // Preferences-gated suppression: COMPANY disables their own partnership
  301 |   // notifications via PATCH /user-preferences/me (self-edit, no admin,
  302 |   // no Firebase claim). Influencer applies → no APPLICATION_RECEIVED.
  303 |   //
  304 |   // The original fixme premise was wrong: it confused self-edit
  305 |   // (`PATCH /user-preferences/me`, isAuthenticated()) with admin-edit
  306 |   // (`PATCH /user-preferences/user/{userId}`, hasAuthority('ADMIN')).
  307 |   // Self-edit has zero Firebase touchpoint — UserPreferencesService.java
  308 |   // imports no FirebaseAuth, and the patchCurrentUserPreferences method
  309 |   // is a flat DB write + GDPR audit log.
  310 |   //
  311 |   // Whitelist (UserPreferencesService.processPreferencesUpdates:265-346):
  312 |   //   - notificationPartnershipEnabled       (gates in-app notification)
  313 |   //   - notificationEmailPartnershipEnabled  (gates email)
  314 |   //   - notificationEmailEnabled             (global email toggle)
  315 |   // --------------------------------------------------------------------
  316 |   test('@notification-preferences disabled prefs suppress APPLICATION_RECEIVED', async ({
  317 |     page,
  318 |     browser,
  319 |   }) => {
  320 |     const companyEmail = UNIQUE_COMPANY();
  321 |     await seedSession(page, companyEmail, 'COMPANY');
  322 |     // Second seed flips emailVerified=true so the campaign POST passes the filter.
  323 |     await seedSession(page, companyEmail, 'COMPANY');
  324 |     await clearInbox(page);
  325 | 
  326 |     // Self-disable partnership notifications (in-app + email).
  327 |     const prefsRes = await api(page, 'PATCH', '/user-preferences/me', {
  328 |       notificationPartnershipEnabled: false,
  329 |       notificationEmailPartnershipEnabled: false,
  330 |     });
  331 |     if (prefsRes.status() === 404) {
  332 |       test.skip(true, '/user-preferences/me not registered in this BE profile.');
  333 |     }
  334 |     expect(
  335 |       prefsRes.status(),
  336 |       `self-PATCH /user-preferences/me should be 200, got ${prefsRes.status()}: ${await prefsRes.text()}`,
  337 |     ).toBe(200);
  338 | 
  339 |     const initialRes = await api(page, 'GET', '/notifications/unread/count');
  340 |     const initialUnread = ((await initialRes.json()) as UnreadCountResponse).count ?? 0;
  341 | 
  342 |     const { id: campaignId } = await createCampaign(page, 'PrefsSuppressedCampaign');
  343 | 
  344 |     // Use the Instagram-seeded variant so /applied-opportunity actually
  345 |     // succeeds — the BE notification-suppression check only fires AFTER
  346 |     // the apply lands. Without Instagram, apply 403s and the test would
  347 |     // be moot (no apply event = trivially no notification, not a real
  348 |     // suppression assertion).
  349 |     const inf = await seedInfluencerContextWithInstagram(browser);
  350 |     try {
  351 |       const applyRes = await api(inf.page, 'POST', '/applied-opportunity', {
  352 |         partnershipOpportunity: campaignId,
  353 |         note: 'Should be suppressed by prefs.',
  354 |       });
> 355 |       expect(applyRes.status(), `apply should succeed, got ${applyRes.status()}`).toBeLessThan(300);
      |                                                                                   ^ Error: apply should succeed, got 401
  356 |     } finally {
  357 |       await inf.context.close();
  358 |     }
  359 | 
  360 |     // Flush queued emails synchronously — prevents a stuck cron from masking
  361 |     // a false negative ("no email yet" because the queue hasn't drained vs
  362 |     // "no email ever" because the preference suppressed it).
  363 |     await flushPendingEmails(page);
  364 | 
  365 |     // Suppression assertion #1: unread count must NOT have increased
  366 |     const afterRes = await api(page, 'GET', '/notifications/unread/count');
  367 |     const afterUnread = ((await afterRes.json()) as UnreadCountResponse).count ?? -1;
  368 |     expect(
  369 |       afterUnread,
  370 |       `unread count should stay at ${initialUnread} when partnership prefs are off; got ${afterUnread}`,
  371 |     ).toBe(initialUnread);
  372 | 
  373 |     // Suppression assertion #2: no APPLICATION_RECEIVED in the listing
  374 |     const listRes = await api(page, 'GET', '/notifications?page=0&size=10');
  375 |     const list = (await listRes.json()) as PageNotificationDtoOut;
  376 |     const items: NotificationDtoOut[] = list.content ?? [];
  377 |     expect(
  378 |       items.find((n) => String(n.type) === 'APPLICATION_RECEIVED'),
  379 |       'APPLICATION_RECEIVED notification should be suppressed by prefs',
  380 |     ).toBeUndefined();
  381 | 
  382 |     // Suppression assertion #3: no [CheckItOut] email to the company
  383 |     const inbox = await listInbox(page, { to: companyEmail });
  384 |     expect(
  385 |       inbox.filter((m) => /\[CheckItOut\]/.test(m.subject)).length,
  386 |       'no [CheckItOut] email should be delivered when partnership email pref is off',
  387 |     ).toBe(0);
  388 |   });
  389 | 
  390 |   // --------------------------------------------------------------------
  391 |   // @email-delivery — unblocked by GreenMail-in-dev (BE c235fc52).
  392 |   // The notification email subsystem dispatches via a 15-minute cron;
  393 |   // tests trigger /test/email/flush to invoke the same code path inline.
  394 |   // --------------------------------------------------------------------
  395 |   test('@email-delivery GreenMail receives [CheckItOut] email after apply', async ({
  396 |     page,
  397 |     browser,
  398 |   }) => {
  399 |     // Clean slate: no stray emails from a prior scenario.
  400 |     const companyEmail = UNIQUE_COMPANY();
  401 |     await seedSession(page, companyEmail, 'COMPANY');
  402 |     // Second seed flips emailVerified=true so the campaign POST passes the filter.
  403 |     await seedSession(page, companyEmail, 'COMPANY');
  404 |     await clearInbox(page);
  405 | 
  406 |     // COMPANY creates campaign.
  407 |     const { id: campaignId } = await createCampaign(page, 'EmailDeliveryCampaign');
  408 | 
  409 |     // INFLUENCER applies — triggers APPLICATION_RECEIVED notification +
  410 |     // queued email to COMPANY's address. Skip path mirrors scenario 1.
  411 |     const inf = await seedInfluencerContext(browser);
  412 |     try {
  413 |       const applyRes = await api(inf.page, 'POST', '/applied-opportunity', {
  414 |         partnershipOpportunity: campaignId,
  415 |         note: 'Testing notification email delivery!',
  416 |       });
  417 |       if (applyRes.status() === 403) {
  418 |         const body = await applyRes.text();
  419 |         test.skip(
  420 |           true,
  421 |           `INFLUENCER apply requires real Instagram OAuth (social connections). Mock-session blocker; body=${body}`,
  422 |         );
  423 |       }
  424 |       expect(applyRes.status(), `apply should succeed, got ${applyRes.status()}`).toBeLessThan(300);
  425 |     } finally {
  426 |       await inf.context.close();
  427 |     }
  428 | 
  429 |     // Push the notification-email queue through synchronously. Production
  430 |     // code emits the same dispatch via EmailCronJob.processEmailQueue every
  431 |     // 15 minutes; tests can't wait, so /test/email/flush invokes the same
  432 |     // method inline.
  433 |     await flushPendingEmails(page);
  434 | 
  435 |     // Email landed in GreenMail; assert envelope + [CheckItOut] subject
  436 |     // prefix the BE prepends in NotificationEmailService.buildSubject.
  437 |     const inbox = await listInbox(page, { to: companyEmail });
  438 |     expect(
  439 |       inbox.length,
  440 |       `GreenMail should have ≥1 email for ${companyEmail} after flush; got ${inbox.length}`,
  441 |     ).toBeGreaterThanOrEqual(1);
  442 | 
  443 |     const email = inbox[0]!;
  444 |     expect(email.subject, 'subject should carry [CheckItOut] prefix').toMatch(/\[CheckItOut\]/);
  445 |     expect(
  446 |       email.to.some((addr) => addr.includes(companyEmail)),
  447 |       'TO should include COMPANY',
  448 |     ).toBe(true);
  449 |   });
  450 | });
  451 | 
```