import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A person's mark where there is no photo: their initials on a disc whose
 * colour is theirs — derived from the name, so the same person gets the same
 * disc on every list, and two people next to each other get two different
 * ones.
 *
 * Grew out of the company tour's applicants page, where two rows carried the
 * same grey circle and the reviewer could not tell at a glance that they were
 * two people (owner, 2026-09-07). `aria-hidden`: the name is always printed
 * next to it.
 */
interface Tone {
  readonly bg: string;
  readonly fg: string;
}

/** Eight warm, distinct pairs that sit on the cream ground; each passes 4.5:1. */
const TONES: readonly Tone[] = [
  { bg: '#fbdcd2', fg: '#8a2f13' }, // coral
  { bg: '#d9e3f5', fg: '#1f3a63' }, // navy
  { bg: '#d8ead0', fg: '#2b5327' }, // moss
  { bg: '#eadcf1', fg: '#5a2a6f' }, // plum
  { bg: '#fbe6bf', fg: '#6f4302' }, // amber
  { bg: '#cfe9e6', fg: '#0f4b47' }, // teal
  { bg: '#f9d9e4', fg: '#7f2245' }, // rose
  { bg: '#e0e5ea', fg: '#2f3b4a' }, // slate
];

function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [class]="'avatar avatar--' + size()"
      [style.background]="tone().bg"
      [style.color]="tone().fg"
      aria-hidden="true"
      data-testid="avatar"
    >
      {{ initials() }}
    </span>
  `,
  styles: `
    .avatar {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      font-weight: 600;
      letter-spacing: 0.04em;
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.55);
      user-select: none;
    }
    .avatar--sm {
      width: 2rem;
      height: 2rem;
      font-size: 0.7rem;
    }
    .avatar--md {
      width: 2.75rem;
      height: 2.75rem;
      font-size: 0.9rem;
    }
    .avatar--lg {
      width: 3.5rem;
      height: 3.5rem;
      font-size: 1.15rem;
    }
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  readonly initials = computed(() => {
    const parts = this.name()
      .trim()
      .split(/\s+/)
      .filter((p) => p.length > 0);
    if (parts.length === 0) return '?';
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toLocaleUpperCase();
  });

  readonly tone = computed(
    () => TONES[hash(this.name().trim().toLocaleLowerCase()) % TONES.length],
  );
}
