import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { MarketingToolbarComponent } from '../landing/marketing-toolbar/marketing-toolbar.component';

interface TeamMember {
  readonly name: string;
  /** Proper nouns and titles — identical across languages, so literals. */
  readonly role: string;
  readonly photo: string;
  readonly socialLinks: { readonly linkedin: string; readonly github?: string };
}

/**
 * `/team` — the public team page. The roster is the SAME three people the
 * landing's OSS-story section shows (owner 2026-09-02: exactly three
 * members, same photos, same text) — one roster, two surfaces, no drift.
 * Headings come from `landing.team.*`; names/roles are literals like the
 * OSS section (proper nouns and titles, identical in PL/EN).
 */
@Component({
  selector: 'app-team',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, MarketingToolbarComponent],
  templateUrl: './team.component.html',
})
export class TeamComponent {
  readonly teamMembers: readonly TeamMember[] = [
    {
      name: 'Norbert Marchewka',
      role: 'Full Stack Developer',
      photo: 'assets/images/team/norbert.jpg',
      socialLinks: {
        linkedin: 'https://www.linkedin.com/in/norbert-marchewka-292377129/',
        github: 'https://github.com/RamzesX',
      },
    },
    {
      name: 'Jakub Sadowski',
      role: 'Backend Developer & QA',
      photo: 'assets/images/team/jakub.jpg',
      socialLinks: {
        linkedin: 'https://www.linkedin.com/in/jakub-sadowski-33205995/',
        github: 'https://github.com/jakubs21',
      },
    },
    {
      name: 'Piotr Żmudzki',
      role: 'Software Developer',
      photo: 'assets/images/team/piotr.jpg',
      socialLinks: {
        linkedin: 'https://www.linkedin.com/in/piotr-%C5%BCmudzki-89a857278/',
        github: 'https://github.com/pZmudzki',
      },
    },
  ];
}
