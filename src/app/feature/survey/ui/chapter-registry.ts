/**
 * Chapter registry — the single source of truth for the technical-survey
 * README structure ("Startup in the box"). The hub's question-cards, each
 * chapter's shell (eyebrow, prev/next) and the deep-link strip all read from
 * here, so a chapter is added/reordered in exactly one place.
 *
 * Ported from the legacy demo build (feature/demo). Icons are Material
 * ligature names here (legacy used feather svgIcons — greenfield has no
 * feather registry); every name must exist in the shipped icon subset
 * (gate G13 `check:icon-subset`).
 *
 * i18n convention per chapter: landing.survey.chapters.<key>.{name,question,intro}.
 */
export interface SurveyChapter {
  key: 'platform' | 'security' | 'compliance' | 'operations' | 'engineering';
  /** Route segment under /technical-survey. */
  path: string;
  /** Material ligature used in compact/mono contexts (chapter eyebrow). */
  icon: string;
  /** Native emoji emblem — hub cards + landing minis (color, no extra palette). */
  emoji: string;
  /** 1-based reading order — drives "Chapter n of 5" and prev/next. */
  order: number;
  /** Card count shown on the hub (kept current as cards land). */
  cards: number;
  /** Approximate reading time shown on the hub. */
  minutes: number;
  /** Heraldic accent — each chapter is its own "faction" on the hub cards. */
  hue: 'indigo' | 'rose' | 'amber' | 'sky' | 'violet';
}

export const SURVEY_CHAPTERS: SurveyChapter[] = [
  {
    key: 'platform',
    path: 'platform',
    icon: 'extension',
    emoji: '🧩',
    order: 1,
    cards: 5,
    minutes: 8,
    hue: 'indigo',
  },
  {
    key: 'security',
    path: 'security',
    icon: 'shield',
    emoji: '🛡️',
    order: 2,
    cards: 5,
    minutes: 9,
    hue: 'rose',
  },
  {
    key: 'compliance',
    path: 'compliance',
    icon: 'fact_check',
    emoji: '⚖️',
    order: 3,
    cards: 2,
    minutes: 4,
    hue: 'amber',
  },
  {
    key: 'operations',
    path: 'operations',
    icon: 'dns',
    emoji: '🔧',
    order: 4,
    cards: 5,
    minutes: 9,
    hue: 'sky',
  },
  {
    key: 'engineering',
    path: 'engineering',
    icon: 'account_tree',
    emoji: '🧪',
    order: 5,
    cards: 7,
    minutes: 14,
    hue: 'violet',
  },
];

export function chapterByKey(key: SurveyChapter['key']): SurveyChapter {
  // Registry is a closed const list — the bang is safe by construction.
  return SURVEY_CHAPTERS.find((c) => c.key === key)!;
}
