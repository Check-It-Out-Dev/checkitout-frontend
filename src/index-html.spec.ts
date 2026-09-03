import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// a11y guard (iter-147, Lighthouse landing "meta-viewport", the heaviest
// a11y audit at weight 10). The viewport meta must not cap zoom: low-vision
// users have to be able to pinch-to-zoom (WCAG 1.4.4 Resize Text). The
// legacy maximum-scale=1.0 that failed the audit was removed; iOS Safari
// input auto-zoom is instead prevented by >=16px Material input text
// (material-theme.scss overrides only the serif headline levels). This
// locks the regression so the zoom cap can't quietly come back.
describe('index.html viewport a11y', () => {
  const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
  const viewport = html.match(/name="viewport"[\s\S]*?content="([^"]*)"/i)?.[1] ?? '';

  it('declares exactly one width=device-width viewport', () => {
    expect((html.match(/name="viewport"/gi) ?? []).length).toBe(1);
    expect(viewport).toContain('width=device-width');
  });

  it('never caps zoom (WCAG 1.4.4 — pinch-to-zoom stays available)', () => {
    expect(viewport).not.toContain('maximum-scale');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  });
});
