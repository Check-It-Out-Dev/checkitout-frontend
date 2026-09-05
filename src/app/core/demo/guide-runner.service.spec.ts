import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { GuideRunnerService } from './guide-runner.service';

/** jsdom has no layout: getClientRects() is empty for everything, so the
 * runner's "rendered" check is stubbed per element. */
function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  for (const el of host.querySelectorAll<HTMLElement>('*')) {
    el.getClientRects = () => [{}] as unknown as DOMRectList;
  }
  return host;
}

describe('GuideRunnerService', () => {
  let service: GuideRunnerService;
  let router: { navigateByUrl: jest.Mock; events: Subject<unknown>; url: string };

  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    router = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
      events: new Subject<unknown>(),
      url: '/company/setup',
    };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    service = TestBed.inject(GuideRunnerService);
  });

  it('fills an input through the native setter and fires the events Angular listens to', async () => {
    mount('<input data-testid="nip">');
    const input = document.querySelector<HTMLInputElement>('[data-testid="nip"]')!;
    const events: string[] = [];
    for (const type of ['input', 'change', 'blur'])
      input.addEventListener(type, () => events.push(type));

    const ok = await service.run([
      { kind: 'fill', selector: '[data-testid="nip"]', value: '5260250995' },
    ]);

    expect(ok).toBe(true);
    expect(input.value).toBe('5260250995');
    expect(events).toEqual(['input', 'change', 'blur']);
  });

  it('keeps what the visitor already typed unless the recipe says overwrite', async () => {
    mount(
      '<input data-testid="email" value="firma@example.com"><input data-testid="code" value="111111">',
    );

    await service.run([
      { kind: 'fill', selector: '[data-testid="email"]', value: 'other@example.com' },
      { kind: 'fill', selector: '[data-testid="code"]', value: '222222', overwrite: true },
    ]);

    expect(document.querySelector<HTMLInputElement>('[data-testid="email"]')!.value).toBe(
      'firma@example.com',
    );
    expect(document.querySelector<HTMLInputElement>('[data-testid="code"]')!.value).toBe('222222');
  });

  it('replaces a half-typed value the form rejects, keeps one it accepts', async () => {
    mount(
      '<input data-testid="bad" class="ng-invalid" value="526">' +
        '<input data-testid="good" value="5260250995">',
    );

    await service.run([
      { kind: 'fill', selector: '[data-testid="bad"]', value: '5260250995' },
      { kind: 'fill', selector: '[data-testid="good"]', value: '1111111111' },
    ]);

    // the rejected one is corrected, the visitor's working value is left alone
    expect(document.querySelector<HTMLInputElement>('[data-testid="bad"]')!.value).toBe(
      '5260250995',
    );
    expect(document.querySelector<HTMLInputElement>('[data-testid="good"]')!.value).toBe(
      '5260250995',
    );
  });

  it('leaves the caret where the visitor put it', async () => {
    mount('<input data-testid="nip" class="ng-invalid" value="526">');
    const input = document.querySelector<HTMLInputElement>('[data-testid="nip"]')!;
    input.focus();
    const blurs: string[] = [];
    input.addEventListener('blur', () => blurs.push('blur'));

    await service.run([{ kind: 'fill', selector: '[data-testid="nip"]', value: '5260250995' }]);

    expect(input.value).toBe('5260250995');
    expect(blurs).toEqual([]); // no blur under the visitor's own caret
    expect(document.activeElement).toBe(input);
  });

  it('types a code the demo minted earlier, reading a JSON field from sessionStorage', async () => {
    sessionStorage.setItem('demoTotp', JSON.stringify({ attempt: 1, code: '482913' }));
    mount('<input data-testid="code">');

    const ok = await service.run([
      { kind: 'fillFromStorage', selector: '[data-testid="code"]', key: 'demoTotp', field: 'code' },
    ]);

    expect(ok).toBe(true);
    expect(document.querySelector<HTMLInputElement>('[data-testid="code"]')!.value).toBe('482913');
  });

  it('clicks a control once it appears', async () => {
    const host = mount('<div></div>');
    const clicked = jest.fn();
    setTimeout(() => {
      const btn = document.createElement('button');
      btn.dataset['testid'] = 'late';
      btn.getClientRects = () => [{}] as unknown as DOMRectList;
      btn.addEventListener('click', clicked);
      host.appendChild(btn);
    }, 120);

    const ok = await service.run([{ kind: 'click', selector: '[data-testid="late"]' }]);

    expect(ok).toBe(true);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('runs a recipe without scripted pauses', async () => {
    mount('<input data-testid="a"><input data-testid="b"><input data-testid="c">');
    const started = Date.now();

    await service.run([
      { kind: 'fill', selector: '[data-testid="a"]', value: '1' },
      { kind: 'fill', selector: '[data-testid="b"]', value: '2' },
      { kind: 'fill', selector: '[data-testid="c"]', value: '3' },
    ]);

    // Three fills used to cost 660 ms of deliberate gaps.
    expect(Date.now() - started).toBeLessThan(250);
  });

  it('reads a step as done from what the DOM shows', () => {
    mount('<div data-testid="card"></div>');

    expect(service.isDone({ appears: '[data-testid="card"]' })).toBe(true);
    expect(service.isDone({ appears: '[data-testid="missing"]' })).toBe(false);
    expect(service.isDone({ disappears: '[data-testid="card"]' })).toBe(false);
    expect(service.isDone({ disappears: '[data-testid="missing"]' })).toBe(true);
    expect(service.isDone({ route: '^/company/setup' })).toBe(true);
    expect(service.isDone({ route: '^/subscription' })).toBe(false);
  });

  it('reads a step as done from something the demo stored', () => {
    expect(service.isDone({ storage: 'demoPlan' })).toBe(false);

    sessionStorage.setItem('demoPlan', 'ENTERPRISE');

    expect(service.isDone({ storage: 'demoPlan' })).toBe(true);
  });

  it('a disappears condition waits for the element to show up first', () => {
    const pred = service.doneWatcher({ disappears: '[data-testid="dialog"]' });
    expect(pred()).toBe(false); // the route has not rendered it yet

    const host = mount('<div data-testid="dialog"></div>');
    expect(pred()).toBe(false); // now it is on screen

    host.innerHTML = '';
    expect(pred()).toBe(true); // and gone again — the visitor closed it
  });

  it('watch resolves on the mutation that makes the condition true', async () => {
    const host = mount('<div></div>');
    const onTrue = jest.fn();
    service.watch(() => service.visible('[data-testid="late"]') !== null, onTrue);
    expect(onTrue).not.toHaveBeenCalled();

    const el = document.createElement('div');
    el.dataset['testid'] = 'late';
    el.getClientRects = () => [{}] as unknown as DOMRectList;
    host.appendChild(el);
    await new Promise((r) => setTimeout(r, 60));

    expect(onTrue).toHaveBeenCalledTimes(1);
  });

  it('does not press a control a modal is covering', async () => {
    mount('<button data-testid="upgrade"></button>');
    const button = document.querySelector<HTMLElement>('[data-testid="upgrade"]')!;
    button.getBoundingClientRect = () =>
      ({ left: 100, top: 100, width: 200, height: 40 }) as DOMRect;
    const overlay = document.createElement('div');
    overlay.className = 'cdk-overlay-container';
    const pane = document.createElement('div');
    pane.className = 'cdk-overlay-pane';
    overlay.appendChild(pane);
    document.body.appendChild(overlay);
    document.elementFromPoint = () => overlay;
    const clicked = jest.fn();
    button.addEventListener('click', clicked);

    const ok = await service.run([{ kind: 'click', selector: '[data-testid="upgrade"]' }]);

    expect(ok).toBe(true); // the dialog it opens is already open — nothing to do
    expect(clicked).not.toHaveBeenCalled();
    expect(service.coveredByModal(button)).toBe(true);
  });

  it('gives up on a control that never appears instead of hanging the tour', async () => {
    const ok = await service.run([
      { kind: 'waitFor', selector: '[data-testid="never"]', timeoutMs: 150 },
    ]);
    expect(ok).toBe(false);
  });

  it('ensure navigates to the fallback route when the control is not on the page', async () => {
    router.navigateByUrl.mockImplementation(async () => {
      mount('<button data-testid="apply"></button>');
      return true;
    });

    const ok = await service.run([
      { kind: 'ensure', selector: '[data-testid="apply"]', url: '/collaborations/503' },
    ]);

    expect(ok).toBe(true);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/collaborations/503');
  });

  it('skips a step the visitor has already taken rather than waiting it out', async () => {
    // The cascade's shape: open, confirm, close. A visitor who confirms by hand
    // leaves no Confirm button, so waiting for one costs the full four-second
    // lookup with the page shielded — measured at 4048 ms, and the freeze the
    // owner reported. The close button being present says we are past it.
    mount('<button data-testid="late">close</button>');

    const started = Date.now();
    const ok = await service.run([
      { kind: 'click', selector: '[data-testid="gone"]' },
      { kind: 'click', selector: '[data-testid="late"]' },
    ]);

    expect(ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('still waits for a control that is simply not there yet', async () => {
    // Nothing later is on screen either, so this is an ordinary recipe whose
    // control has not rendered — it must keep its full lookup and report that
    // it could not act.
    const ok = await service.run([{ kind: 'click', selector: '[data-testid="gone"]' }]);

    expect(ok).toBe(false);
  }, 10_000);
});
