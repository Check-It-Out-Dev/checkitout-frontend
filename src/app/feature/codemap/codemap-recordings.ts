/**
 * Recorded CodeMap sessions replayed by the trajectory player. Every line is a
 * VERBATIM capture from live runs against the frozen v1 navigator on
 * 2026-09-02 (the same sessions the demo film was shot from) — the player
 * animates them but never invents them. Long answers are truncated with an
 * ellipsis; token receipts are the real Anthropic usage numbers. The
 * graph-native run (tierTag 'big') was captured 2026-09-03 from the local
 * 80B tier — same machine, same film, temperature-0 reproducible.
 */

export interface RecordedStep {
  /** CMDSL line exactly as the model emitted it. */
  readonly dsl: string;
}

export interface RecordedRun {
  readonly id: string;
  /** The question chip (recorded questions are English — shown verbatim). */
  readonly question: string;
  /** 'big' = the local 80B graph-native tier drove this run (default: the 4B). */
  readonly tierTag?: 'big';
  /** Local-tier trajectory (grammar-constrained 4B on a plain CPU). */
  readonly localSteps: readonly RecordedStep[];
  /** Terminal state of the local tier. */
  readonly terminal: 'answer' | 'pass';
  /** Local answer or pass reason (verbatim, possibly truncated). */
  readonly localText: string;
  /** Present only when the run escalated: the consent-gated API tier. */
  readonly api?: {
    readonly model: string;
    readonly steps: readonly RecordedStep[];
    readonly answer: string;
    readonly tokensIn: number;
    readonly tokensOut: number;
  };
}

export const RECORDED_RUNS: readonly RecordedRun[] = [
  {
    id: 'impact',
    question: 'what breaks if I change UserRepository.java?',
    localSteps: [{ dsl: 'find(UserRepository.java)' }, { dsl: 'impact(UserRepository.java)' }],
    terminal: 'answer',
    localText:
      '51 dependency edges from 79 files across 14 subsystems point at ' +
      'UserRepository.java. Heaviest dependents: ActiveCooperationService.java, ' +
      'AddressService.java, AdminCascadeDeleteServiceImpl.java, ' +
      'AppliedOpportunityContentService.java, AuthService.java, ' +
      'AuthDtoValidator.java, BannedUserConsentEnforcementFilter.java…',
  },
  {
    id: 'subsystem',
    question: 'which files form the notification subsystem?',
    localSteps: [{ dsl: 'find(Notification)' }],
    terminal: 'answer',
    localText:
      'Located: NotificationService_AccountActivation_IntegrationTest.java (Rule, ' +
      'sub-12); NotificationService_CreateNotification_IntegrationTest.java (Rule, ' +
      'sub-12); NotificationService_ShouldNotify_IntegrationTest.java (Rule, sub-12); ' +
      'NotificationServiceIntegrationTestBase.java (Rule, sub-12)… Paths in gold rows.',
  },
  {
    id: 'native',
    question:
      'how many files import ResourceNotFoundException, and which subsystem do most of them live in?',
    tierTag: 'big',
    localSteps: [
      { dsl: 'find(ResourceNotFoundException)' },
      { dsl: 'impact(ResourceNotFoundException.java)' },
      {
        dsl:
          'cypher(MATCH (e:Entity)-[r:Dep]->(b:Entity) WHERE b.name = ' +
          "'ResourceNotFoundException.java' AND r.rel = 'IMPORTS' RETURN " +
          'coalesce(e.curated, e.subsystem) AS subsystem, count(*) AS count ' +
          'ORDER BY count DESC LIMIT 1)',
      },
      {
        dsl:
          'cypher(MATCH (e:Entity)-[r:Dep]->(b:Entity) WHERE b.name = ' +
          "'ResourceNotFoundException.java' AND r.rel = 'IMPORTS' RETURN " +
          'coalesce(e.curated, e.subsystem) AS sub, count(*) AS cnt ' +
          'ORDER BY cnt DESC LIMIT 1)',
      },
    ],
    terminal: 'answer',
    localText:
      '100 files import ResourceNotFoundException.java; most (31) live in [4] ' +
      'Partnership opportunity lifecycle',
  },
  {
    id: 'honest',
    question: 'why was HMAC chosen over JWT for the consent cookies?',
    localSteps: [
      {
        dsl:
          'pass("needs-content-read: the answer lives in file content; ' +
          'the graph pins where — see the pointer in my reason")',
      },
    ],
    terminal: 'pass',
    localText:
      'needs-content-read: the answer lives in file content; the graph pins where — ' +
      'see the pointer in my reason',
    api: {
      model: 'claude-sonnet-5',
      steps: [
        { dsl: 'find("HMAC")' },
        { dsl: 'find("consent")' },
        { dsl: 'impact(HmacUtils.java)' },
        { dsl: 'flow(ConsentCookieService.java)' },
      ],
      answer:
        'The graph confirms the structural fact — ConsentCookieService.java (sub 11) ' +
        'imports HmacUtils.java (sub 8) to sign/verify the consent cookie value, and ' +
        'HmacUtils is a shared crypto utility used across subsystems 0, 3, 5, 9, 10, ' +
        '11, 15. However, the graph only encodes structure — not design rationale. ' +
        "There's no node that states *why* HMAC was picked over JWT… I can't " +
        "fabricate a rationale, so I'd need you to point me at that file's " +
        'comments/docs if you want the "why."',
      tokensIn: 21091,
      tokensOut: 1094,
    },
  },
];
