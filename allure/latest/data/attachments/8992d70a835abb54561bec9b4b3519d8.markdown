# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: integration/flows/notification-lifecycle.spec.ts >> @notification-lifecycle — port of notification-e2e.feature >> @notification-preferences disabled prefs suppress APPLICATION_RECEIVED
- Location: e2e-tests/integration/flows/notification-lifecycle.spec.ts:319:7

# Error details

```
Error: apply should succeed, got 401

expect(received).toBeLessThan(expected)

Expected: < 300
Received:   401
```

# Test source

```ts
  258 |     expect(markAllRes.status(), 'mark-all-read should be 200').toBe(200);
  259 | 
  260 |     const afterAllRes = await api(page, 'GET', '/notifications/unread/count');
  261 |     expect(afterAllRes.status()).toBe(200);
  262 |     const afterAllCount = ((await afterAllRes.json()) as UnreadCountResponse).count ?? -1;
  263 |     expect(afterAllCount, 'unread count should be 0 after mark-all-read').toBe(0);
  264 | 
  265 |     // Phase 8: Archive notification → 204 → removed from list
  266 |     const archiveRes = await api(page, 'DELETE', `/notifications/${notifId}`);
  267 |     expect(
  268 |       [200, 204].includes(archiveRes.status()),
  269 |       `archive should be 200/204, got ${archiveRes.status()}`,
  270 |     ).toBe(true);
  271 | 
  272 |     const afterArchiveRes = await api(page, 'GET', '/notifications?page=0&size=10');
  273 |     expect(afterArchiveRes.status()).toBe(200);
  274 |     const afterArchive = (await afterArchiveRes.json()) as PageNotificationDtoOut;
  275 |     const remaining: NotificationDtoOut[] = afterArchive.content ?? [];
  276 |     expect(
  277 |       remaining.find((n) => n.id === notifId),
  278 |       `archived notification ${notifId} should NOT be in list anymore`,
  279 |     ).toBeUndefined();
  280 | 
  281 |     // Phase 9: Cross-user isolation — INFLUENCER should NOT see COMPANY's notif
  282 |     const inf2 = await seedInfluencerContext(browser);
  283 |     try {
  284 |       const infListRes = await api(inf2.page, 'GET', '/notifications?page=0&size=10');
  285 |       expect(infListRes.status()).toBe(200);
  286 |       const infList = (await infListRes.json()) as PageNotificationDtoOut;
  287 |       const infItems: NotificationDtoOut[] = infList.content ?? [];
  288 |       // A fresh INFLUENCER actor would have 0 items related to this test's
  289 |       // campaign id (campaigns notify the COMPANY owner, not influencers).
  290 |       expect(
  291 |         infItems.find((n) => n.id === notifId),
  292 |         `INFLUENCER should NOT see COMPANY's notification ${notifId}`,
  293 |       ).toBeUndefined();
  294 |     } finally {
  295 |       await inf2.context.close();
  296 |     }
  297 |   });
  298 | 
  299 |   // --------------------------------------------------------------------
  300 |   // Scenario 2: Preferences-gated suppression
  301 |   // --------------------------------------------------------------------
  302 |   // --------------------------------------------------------------------
  303 |   // Preferences-gated suppression: COMPANY disables their own partnership
  304 |   // notifications via PATCH /user-preferences/me (self-edit, no admin,
  305 |   // no Firebase claim). Influencer applies → no APPLICATION_RECEIVED.
  306 |   //
  307 |   // The original fixme premise was wrong: it confused self-edit
  308 |   // (`PATCH /user-preferences/me`, isAuthenticated()) with admin-edit
  309 |   // (`PATCH /user-preferences/user/{userId}`, hasAuthority('ADMIN')).
  310 |   // Self-edit has zero Firebase touchpoint — UserPreferencesService.java
  311 |   // imports no FirebaseAuth, and the patchCurrentUserPreferences method
  312 |   // is a flat DB write + GDPR audit log.
  313 |   //
  314 |   // Whitelist (UserPreferencesService.processPreferencesUpdates:265-346):
  315 |   //   - notificationPartnershipEnabled       (gates in-app notification)
  316 |   //   - notificationEmailPartnershipEnabled  (gates email)
  317 |   //   - notificationEmailEnabled             (global email toggle)
  318 |   // --------------------------------------------------------------------
  319 |   test('@notification-preferences disabled prefs suppress APPLICATION_RECEIVED', async ({
  320 |     page,
  321 |     browser,
  322 |   }) => {
  323 |     const companyEmail = UNIQUE_COMPANY();
  324 |     await seedSession(page, companyEmail, 'COMPANY');
  325 |     // Second seed flips emailVerified=true so the campaign POST passes the filter.
  326 |     await seedSession(page, companyEmail, 'COMPANY');
  327 |     await clearInbox(page);
  328 | 
  329 |     // Self-disable partnership notifications (in-app + email).
  330 |     const prefsRes = await api(page, 'PATCH', '/user-preferences/me', {
  331 |       notificationPartnershipEnabled: false,
  332 |       notificationEmailPartnershipEnabled: false,
  333 |     });
  334 |     if (prefsRes.status() === 404) {
  335 |       test.skip(true, '/user-preferences/me not registered in this BE profile.');
  336 |     }
  337 |     expect(
  338 |       prefsRes.status(),
  339 |       `self-PATCH /user-preferences/me should be 200, got ${prefsRes.status()}: ${await prefsRes.text()}`,
  340 |     ).toBe(200);
  341 | 
  342 |     const initialRes = await api(page, 'GET', '/notifications/unread/count');
  343 |     const initialUnread = ((await initialRes.json()) as UnreadCountResponse).count ?? 0;
  344 | 
  345 |     const { id: campaignId } = await createCampaign(page, 'PrefsSuppressedCampaign');
  346 | 
  347 |     // Use the Instagram-seeded variant so /applied-opportunity actually
  348 |     // succeeds — the BE notification-suppression check only fires AFTER
  349 |     // the apply lands. Without Instagram, apply 403s and the test would
  350 |     // be moot (no apply event = trivially no notification, not a real
  351 |     // suppression assertion).
  352 |     const inf = await seedInfluencerContextWithInstagram(browser);
  353 |     try {
  354 |       const applyRes = await api(inf.page, 'POST', '/applied-opportunity', {
  355 |         partnershipOpportunity: campaignId,
  356 |         note: 'Should be suppressed by prefs.',
  357 |       });
> 358 |       expect(applyRes.status(), `apply should succeed, got ${applyRes.status()}`).toBeLessThan(300);
      |                                                                                   ^ Error: apply should succeed, got 401
  359 |     } finally {
  360 |       await inf.context.close();
  361 |     }
  362 | 
  363 |     // Flush queued emails synchronously — prevents a stuck cron from masking
  364 |     // a false negative ("no email yet" because the queue hasn't drained vs
  365 |     // "no email ever" because the preference suppressed it).
  366 |     await flushPendingEmails(page);
  367 | 
  368 |     // Suppression assertion #1: unread count must NOT have increased
  369 |     const afterRes = await api(page, 'GET', '/notifications/unread/count');
  370 |     const afterUnread = ((await afterRes.json()) as UnreadCountResponse).count ?? -1;
  371 |     expect(
  372 |       afterUnread,
  373 |       `unread count should stay at ${initialUnread} when partnership prefs are off; got ${afterUnread}`,
  374 |     ).toBe(initialUnread);
  375 | 
  376 |     // Suppression assertion #2: no APPLICATION_RECEIVED in the listing
  377 |     const listRes = await api(page, 'GET', '/notifications?page=0&size=10');
  378 |     const list = (await listRes.json()) as PageNotificationDtoOut;
  379 |     const items: NotificationDtoOut[] = list.content ?? [];
  380 |     expect(
  381 |       items.find((n) => String(n.type) === 'APPLICATION_RECEIVED'),
  382 |       'APPLICATION_RECEIVED notification should be suppressed by prefs',
  383 |     ).toBeUndefined();
  384 | 
  385 |     // Suppression assertion #3: no [CheckItOut] email to the company
  386 |     const inbox = await listInbox(page, { to: companyEmail });
  387 |     expect(
  388 |       inbox.filter((m) => /\[CheckItOut\]/.test(m.subject)).length,
  389 |       'no [CheckItOut] email should be delivered when partnership email pref is off',
  390 |     ).toBe(0);
  391 |   });
  392 | 
  393 |   // --------------------------------------------------------------------
  394 |   // @email-delivery — unblocked by GreenMail-in-dev (BE c235fc52).
  395 |   // The notification email subsystem dispatches via a 15-minute cron;
  396 |   // tests trigger /test/email/flush to invoke the same code path inline.
  397 |   // --------------------------------------------------------------------
  398 |   test('@email-delivery GreenMail receives [CheckItOut] email after apply', async ({
  399 |     page,
  400 |     browser,
  401 |   }) => {
  402 |     // Clean slate: no stray emails from a prior scenario.
  403 |     const companyEmail = UNIQUE_COMPANY();
  404 |     await seedSession(page, companyEmail, 'COMPANY');
  405 |     // Second seed flips emailVerified=true so the campaign POST passes the filter.
  406 |     await seedSession(page, companyEmail, 'COMPANY');
  407 |     await clearInbox(page);
  408 | 
  409 |     // COMPANY creates campaign.
  410 |     const { id: campaignId } = await createCampaign(page, 'EmailDeliveryCampaign');
  411 | 
  412 |     // INFLUENCER applies — triggers APPLICATION_RECEIVED notification +
  413 |     // queued email to COMPANY's address. Skip path mirrors scenario 1.
  414 |     const inf = await seedInfluencerContext(browser);
  415 |     try {
  416 |       const applyRes = await api(inf.page, 'POST', '/applied-opportunity', {
  417 |         partnershipOpportunity: campaignId,
  418 |         note: 'Testing notification email delivery!',
  419 |       });
  420 |       if (applyRes.status() === 403) {
  421 |         const body = await applyRes.text();
  422 |         test.skip(
  423 |           true,
  424 |           `INFLUENCER apply requires real Instagram OAuth (social connections). Mock-session blocker; body=${body}`,
  425 |         );
  426 |       }
  427 |       expect(applyRes.status(), `apply should succeed, got ${applyRes.status()}`).toBeLessThan(300);
  428 |     } finally {
  429 |       await inf.context.close();
  430 |     }
  431 | 
  432 |     // Push the notification-email queue through synchronously. Production
  433 |     // code emits the same dispatch via EmailCronJob.processEmailQueue every
  434 |     // 15 minutes; tests can't wait, so /test/email/flush invokes the same
  435 |     // method inline.
  436 |     await flushPendingEmails(page);
  437 | 
  438 |     // Email landed in GreenMail; assert envelope + [CheckItOut] subject
  439 |     // prefix the BE prepends in NotificationEmailService.buildSubject.
  440 |     const inbox = await listInbox(page, { to: companyEmail });
  441 |     expect(
  442 |       inbox.length,
  443 |       `GreenMail should have ≥1 email for ${companyEmail} after flush; got ${inbox.length}`,
  444 |     ).toBeGreaterThanOrEqual(1);
  445 | 
  446 |     const email = inbox[0]!;
  447 |     expect(email.subject, 'subject should carry [CheckItOut] prefix').toMatch(/\[CheckItOut\]/);
  448 |     expect(
  449 |       email.to.some((addr) => addr.includes(companyEmail)),
  450 |       'TO should include COMPANY',
  451 |     ).toBe(true);
  452 |   });
  453 | });
  454 | 
```