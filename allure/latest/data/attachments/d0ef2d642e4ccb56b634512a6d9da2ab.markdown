# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: perf/demo-smoothness.spec.ts >> Demo smoothness >> a simulator that never fires holds the step instead of narrating it
- Location: e2e-tests/perf/demo-smoothness.spec.ts:322:7

# Error details

```
Error: and it must say so rather than pretending

expect(locator).toBeVisible() failed

Locator: locator('[data-testid="guide-retry"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - and it must say so rather than pretending with timeout 5000ms
  - waiting for locator('[data-testid="guide-retry"]')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e7]:
      - link "Check It Out" [ref=e9] [cursor=pointer]:
        - /url: /demo
        - generic [ref=e10]: Check It Out
      - navigation [ref=e11]:
        - link "Odkrywaj" [ref=e12] [cursor=pointer]:
          - /url: /collaborations/list
          - img [ref=e13]: explore
          - generic [ref=e14]: Odkrywaj
        - link "Moje kampanie" [ref=e15] [cursor=pointer]:
          - /url: /collaborations/my-campaigns
          - img [ref=e16]: campaign
          - generic [ref=e17]: Moje kampanie
        - link "Współprace" [ref=e18] [cursor=pointer]:
          - /url: /collaborations/in-progress
          - img [ref=e19]: handshake
          - generic [ref=e20]: Współprace
        - link "Profil" [ref=e21] [cursor=pointer]:
          - /url: /user/settings/account
          - img [ref=e22]: person
          - generic [ref=e23]: Profil
        - link "Plan i płatności" [ref=e24] [cursor=pointer]:
          - /url: /user/settings/plan-billing
          - img [ref=e25]: credit_card
          - generic [ref=e26]: Plan i płatności
    - generic [ref=e28]:
      - banner [ref=e29]:
        - button "Zmień język" [ref=e30] [cursor=pointer]:
          - img [ref=e31]: expand_more
          - generic [ref=e32]: pl
        - button "Powiadomienia" [ref=e36] [cursor=pointer]:
          - img [ref=e37]: notifications
          - generic: "1"
        - button "Otwórz menu użytkownika" [ref=e40] [cursor=pointer]:
          - img [ref=e41]: account_circle
      - main [ref=e44]:
        - generic [ref=e46]:
          - generic [ref=e47]:
            - heading "Zweryfikuj swoją firmę" [level=1] [ref=e48]
            - paragraph [ref=e49]: Podaj NIP, a pobierzemy dane Twojej firmy z oficjalnych rejestrów (GUS, KRS, CEIDG).
          - generic [ref=e50]:
            - generic [ref=e51]:
              - img [ref=e53]: mark_email_unread
              - generic [ref=e54]:
                - paragraph [ref=e55]: Firma potwierdzona — zweryfikuj e-mail
                - paragraph [ref=e56]: Demo Brand Sp. z o.o. · NIP 5260250995
            - paragraph [ref=e57]: Zapisaliśmy dane Twojej firmy. Zweryfikuj adres e-mail, aby dokończyć aktywację konta.
            - link "Przejdź do ustawień konta" [ref=e59] [cursor=pointer]:
              - /url: /user/settings/account
              - generic [ref=e60]: Przejdź do ustawień konta
  - generic:
    - complementary "Symulacja — prawdziwe maile wysyłają nasze szablony przez SMTP (testowane E2E GreenMailem)." [ref=e63]:
      - generic [ref=e64]:
        - generic [ref=e65]:
          - generic [ref=e66]:
            - img [ref=e67]: inbox
            - generic [ref=e68]: Skrzynka
            - generic [ref=e69]: demo@checkitout.app
          - generic [ref=e70]:
            - generic [ref=e71]:
              - generic [ref=e72]: C
              - generic [ref=e73]:
                - generic [ref=e74]: CheckItOut
                - generic [ref=e75]: noreply@checkitout.app
              - generic [ref=e76]: teraz
            - generic [ref=e77]: Potwierdź swój adres e-mail
            - generic [ref=e78]:
              - paragraph [ref=e79]: Cześć, Demo Brand!
              - paragraph [ref=e80]: Dane Twojej firmy są potwierdzone. Została ostatnia rzecz — jedno kliknięcie w link poniżej aktywuje konto od razu, bez czekania na człowieka.
              - paragraph [ref=e81]: Link działa 24 godziny. Jeśli to nie Ty, zignoruj tę wiadomość.
        - paragraph [ref=e82]: Symulacja — prawdziwe maile wysyłają nasze szablony przez SMTP (testowane E2E GreenMailem).
    - generic [ref=e84]:
      - generic [ref=e85]:
        - generic [ref=e86]:
          - img [ref=e87]: credit_card
          - text: Sandbox
        - generic [ref=e88]: Od NIP-u do KSeF
        - generic [ref=e89]: 3/10
      - status [ref=e92]:
        - paragraph [ref=e93]: "Została jedna rzecz: dowód, że e-mail jest Twój. Brandowany mail właśnie wylądował w skrzynce po lewej — konto czeka na ten jeden klik."
      - paragraph [ref=e94]: Obejrzyj ten ekran i kliknij Dalej
      - generic [ref=e95]:
        - button "Dalej" [ref=e96] [cursor=pointer]:
          - text: Dalej
          - img [ref=e97]: arrow_forward
        - generic [ref=e98]:
          - button "Od nowa" [ref=e99] [cursor=pointer]:
            - img [ref=e100]: replay
          - button "Wyjdź z sandboxa" [ref=e101] [cursor=pointer]:
            - img [ref=e102]: close
```

# Test source

```ts
  260 |     await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 30_000 });
  261 |     await page.waitForTimeout(600);
  262 | 
  263 |     const seen = await page.evaluate(async () => {
  264 |       const w = window as unknown as Record<string, unknown>;
  265 |       let hits = 0;
  266 |       const original = Document.prototype.elementFromPoint;
  267 |       Document.prototype.elementFromPoint = function (...args: [number, number]) {
  268 |         hits++;
  269 |         return original.apply(this, args);
  270 |       };
  271 |       const sides: string[] = [];
  272 |       const lag: number[] = [];
  273 |       const helpers = window as unknown as Record<string, unknown>;
  274 |       const drawn = helpers['__drawnBox'] as (el: Element) => DOMRect;
  275 |       const sample = (): void => {
  276 |         const ring = document.querySelector('[data-testid="guide-spotlight"]');
  277 |         const pill = document.querySelector('[data-testid="guide-spot-next"]');
  278 |         const target = document.querySelector('[data-testid="opp-form-name"]');
  279 |         if (ring && pill && target) {
  280 |           const r = ring.getBoundingClientRect();
  281 |           const q = pill.getBoundingClientRect();
  282 |           const t = drawn(target);
  283 |           sides.push(`${Math.round(q.left - r.left)}`);
  284 |           // Against the showing part of the field, not the whole of it: once a
  285 |           // control passes the top of the pane that holds it the ring stops
  286 |           // there, which is the ring being right rather than late.
  287 |           if (t.height > 0) lag.push(Math.abs(r.top + 6 - t.top));
  288 |         }
  289 |         w['__raf'] = requestAnimationFrame(sample);
  290 |       };
  291 |       w['__raf'] = requestAnimationFrame(sample);
  292 | 
  293 |       const scroller =
  294 |         [...document.querySelectorAll('*')].find(
  295 |           (e) =>
  296 |             e.scrollHeight > e.clientHeight + 4 &&
  297 |             ['auto', 'scroll'].includes(getComputedStyle(e).overflowY),
  298 |         ) ?? document.scrollingElement;
  299 |       for (let i = 0; i < 60; i++) {
  300 |         if (scroller) scroller.scrollTop += 10;
  301 |         await new Promise((r) => requestAnimationFrame(r));
  302 |       }
  303 |       await new Promise((r) => setTimeout(r, 300));
  304 |       cancelAnimationFrame(w['__raf'] as number);
  305 |       Document.prototype.elementFromPoint = original;
  306 |       return { hits, sides: new Set(sides).size, worstLag: Math.max(...lag, 0) };
  307 |     });
  308 | 
  309 |     expect(seen.hits).toBeLessThanOrEqual(12); // 249 before
  310 |     expect(seen.sides).toBeLessThanOrEqual(2); // the pill kept changing sides
  311 |     expect(seen.worstLag).toBeLessThanOrEqual(2); // the ring used to trail its control
  312 |   });
  313 | 
  314 |   /**
  315 |    * A simulator's own button is what confirms a sim step — it calls notify()
  316 |    * when it fires, and those steps declare no other `done`. So a press whose
  317 |    * click never landed is a step that did not happen, and the tour used to
  318 |    * carry on regardless: taking `ksef-sim-done` away on the live demo and
  319 |    * pressing once completed the whole tour and showed the recap, narrating a
  320 |    * KSeF registration that never took place.
  321 |    */
  322 |   test('a simulator that never fires holds the step instead of narrating it', async ({ page }) => {
  323 |     await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
  324 |     await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 30_000 });
  325 | 
  326 |     // two presses reach verify-mail — a sim step with no `done` and no reload
  327 |     for (let i = 0; i < 2; i++) {
  328 |       await page.click('[data-testid="guide-spot-next"]');
  329 |       await page.waitForTimeout(2600);
  330 |     }
  331 |     expect((await tourState(page)).step, 'the walk should have reached verify-mail').toBe(2);
  332 |     await expect(page.locator('[data-testid="inbox-sim-cta"]')).toBeVisible();
  333 | 
  334 |     // Take the simulator's button away: the recipe now has nothing to click,
  335 |     // so nothing can notify and the step cannot have happened.
  336 |     //
  337 |     // Press whichever control is offered, without waiting for it to hold still.
  338 |     // Removing the ring's target makes the pill detach as the ring gives up on
  339 |     // it and the panel takes over, and a `page.click` on the pill spends the
  340 |     // whole timeout watching it come and go.
  341 |     const press = async (): Promise<void> => {
  342 |       await page.evaluate(() => {
  343 |         const b =
  344 |           document.querySelector<HTMLElement>('[data-testid="guide-spot-next"]') ??
  345 |           document.querySelector<HTMLElement>('[data-testid="guide-next"]');
  346 |         b?.click();
  347 |       });
  348 |     };
  349 | 
  350 |     await page.evaluate(() => document.querySelector('[data-testid="inbox-sim-cta"]')?.remove());
  351 |     await press();
  352 |     // long enough for the runner to give up looking for the button it was told
  353 |     // to click (4 s) and for the wait on the simulator to expire (1.5 s)
  354 |     await page.waitForTimeout(7500);
  355 | 
  356 |     expect((await tourState(page)).step, 'an unconfirmed step must not advance').toBe(2);
  357 |     await expect(
  358 |       page.locator('[data-testid="guide-retry"]'),
  359 |       'and it must say so rather than pretending',
> 360 |     ).toBeVisible();
      |       ^ Error: and it must say so rather than pretending
  361 | 
  362 |     // but a visitor who insists is never trapped by a condition we got wrong —
  363 |     // the second press pays the same lookup and wait before it gives up
  364 |     await press();
  365 |     await page.waitForTimeout(7500);
  366 |     expect((await tourState(page)).step, 'a second press moves on regardless').toBe(3);
  367 |   });
  368 | 
  369 |   test('a half-typed value is corrected instead of submitted', async ({ page }) => {
  370 |     await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
  371 |     await page.waitForSelector('[data-testid="guide-spot-next"]', { timeout: 30_000 });
  372 |     await page.click('[data-testid="company-setup-nip"]');
  373 |     await page.keyboard.type('526');
  374 | 
  375 |     const shield = page.locator('[data-testid="guide-shield"]');
  376 |     await page.click('[data-testid="guide-spot-next"]');
  377 |     await expect(page.locator('[data-testid="company-setup-confirm"]')).toBeVisible({
  378 |       timeout: 5_000,
  379 |     });
  380 | 
  381 |     // the guide typed a working NIP over the half-typed one and the step ran
  382 |     await expect(page.locator('[data-testid="company-setup-nip"]')).toHaveValue('5260250995');
  383 |     await expect(shield).toHaveCount(0);
  384 |     const state = await tourState(page);
  385 |     expect(state.step).toBe(1);
  386 |   });
  387 | 
  388 |   test('the main thread stays answerable through a tour', async ({ page }) => {
  389 |     // Long Animation Frames is the signal that replaced counting rAF gaps: it
  390 |     // reports the frames that actually blocked, with the script that caused
  391 |     // them attributed. Event Timing gives the other half — how long the page
  392 |     // took to answer a press (the INP measure).
  393 |     await page.addInitScript(() => {
  394 |       const w = window as unknown as Record<string, unknown>;
  395 |       const loaf: { dur: number; blocking: number; worst: string }[] = [];
  396 |       const slowEvents: number[] = [];
  397 |       w['__supported'] = PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
  398 |       new PerformanceObserver((list) => {
  399 |         for (const e of list.getEntries() as unknown as {
  400 |           duration: number;
  401 |           blockingDuration: number;
  402 |           scripts: { duration: number; invoker?: string; invokerType?: string }[];
  403 |         }[]) {
  404 |           const worst = [...(e.scripts ?? [])].sort((a, b) => b.duration - a.duration)[0];
  405 |           loaf.push({
  406 |             dur: Math.round(e.duration),
  407 |             blocking: Math.round(e.blockingDuration),
  408 |             worst: worst ? `${worst.invokerType}:${worst.invoker}` : '-',
  409 |           });
  410 |         }
  411 |       }).observe({ type: 'long-animation-frame', buffered: true });
  412 |       new PerformanceObserver((list) => {
  413 |         for (const e of list.getEntries()) slowEvents.push(Math.round(e.duration));
  414 |       }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  415 |       w['__loaf'] = loaf;
  416 |       w['__slowEvents'] = slowEvents;
  417 |     });
  418 |     await throttle(page, 4);
  419 |     await page.goto(`${BASE}/demo?start=nip-to-ksef`, { waitUntil: 'networkidle' });
  420 | 
  421 |     expect(
  422 |       await page.evaluate(() => (window as unknown as Record<string, unknown>)['__supported']),
  423 |       'this browser cannot report long animation frames, so the test would prove nothing',
  424 |     ).toBe(true);
  425 | 
  426 |     for (let i = 0; i < 12; i++) {
  427 |       const s = await tourState(page).catch(() => null);
  428 |       if (!s || s.done) break;
  429 |       if (!s.pill && !s.panelNext) {
  430 |         await page.waitForTimeout(300);
  431 |         continue;
  432 |       }
  433 |       await page
  434 |         .click(s.pill ? '[data-testid="guide-spot-next"]' : '[data-testid="guide-next"]', {
  435 |           timeout: 8_000,
  436 |         })
  437 |         .catch(() => undefined);
  438 |       await page.waitForTimeout(400);
  439 |     }
  440 | 
  441 |     const seen = await page.evaluate(() => {
  442 |       const w = window as unknown as Record<string, unknown>;
  443 |       const loaf = w['__loaf'] as { dur: number; blocking: number; worst: string }[];
  444 |       const events = w['__slowEvents'] as number[];
  445 |       return {
  446 |         frames: loaf.length,
  447 |         worst: Math.max(0, ...loaf.map((f) => f.dur)),
  448 |         blocking: loaf.reduce((n, f) => n + f.blocking, 0),
  449 |         worstEvent: Math.max(0, ...events),
  450 |         blame: [...loaf].sort((a, b) => b.dur - a.dur)[0]?.worst ?? '-',
  451 |       };
  452 |     });
  453 | 
  454 |     // What this can honestly assert, and what it cannot.
  455 |     //
  456 |     // The single worst frame is not a property of the application: measured on
  457 |     // an idle machine it is 222, 222, 250 ms, and measured inside the tier's own
  458 |     // twenty-minute run it is 338. A hundred milliseconds of that is whatever
  459 |     // else the box is doing. It was asserted at 250, then at 320, and failed at
  460 |     // both often enough to be noise rather than a guard.
```