import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@ngneat/transloco';
import { SurveyCardComponent } from '../ui/survey-card.component';
import { CodePanelComponent } from '../ui/code-panel.component';
import { GRAPH_REPO_URL } from '../ui/survey-links';
import {
  GRAPH_DATA,
  type GraphCat,
  type GraphDomain,
  type GraphEdge,
  type GraphLeaf,
  type GraphRole,
} from './graph-topology-data';
import { GRAPH_COST } from './graph-cost-data';

/**
 * Knowledge-graph topology showcase — the companion to the bug-hunting
 * graph-assisted-dev card. Where that one shows the graph *finding* defects,
 * this one shows how the whole system is *modelled* so both a human and the
 * AI can navigate it: the NavigationMaster 3-level topology drawn as the graph
 * it is, the metadata an agent reads at every node and edge, the 6-entity
 * behavioural lens, one Cypher query that returns the system's shape, and the
 * complexity argument for why a maintained graph beats packing the codebase
 * into a prompt.
 *
 * The map is the real `CheckItOutSystem` namespace (its 2026-09-06 dump,
 * generated into graph-topology-data.ts by tools/gen-graph-topology.mjs —
 * nothing here is retyped): one master at the centre, the fifteen domain
 * navigators as arcs sized by what they implement, grouped into three
 * category sectors, and the 130 components as marks on the outer ring. Where a
 * component records a behavioural role its mark is that role's glyph (40 do);
 * the other 90 carry a "why" instead and are plain marks — the caption says
 * so. The 22 typed relationships all live inside four domains, so they are
 * short chords inside a sector, lit when it is in focus.
 *
 * Hover previews, click pins, Escape returns to the master; the inspector on
 * the right prints the focused node's properties the way the graph holds
 * them, with the one-hop Cypher that fetches the same card. Below `md` the
 * radial is not shrunk into illegibility: an accordion takes its place, same
 * data, same focus signal.
 *
 * Icons are all in the shipped subset (G13); glyphs are SVG paths.
 */
type Focus = { kind: 'master' } | { kind: 'domain'; key: string } | { kind: 'leaf'; id: string };

/** A domain laid out on the ring. Every number and path the template binds
 * is computed once here: with 130 leaves and ~700 SVG nodes, trig per change
 * detection would be the map's whole hover cost. */
interface Placed {
  readonly domain: GraphDomain;
  readonly fan: number;
  /** degrees, clockwise from the top */
  readonly a0: number;
  readonly a1: number;
  readonly mid: number;
  readonly leaves: readonly PlacedLeaf[];
  readonly arcPath: string;
  /** where the GUIDES line from the master ends */
  readonly guideEnd: { readonly x: string; readonly y: string };
  readonly fanAt: { readonly x: string; readonly y: string };
  readonly tick: {
    readonly x1: string;
    readonly y1: string;
    readonly x2: string;
    readonly y2: string;
  };
  readonly labelTransform: string;
  readonly labelAnchor: 'start' | 'end';
  readonly labelLines: readonly string[];
  readonly hue: string;
  /** all IMPLEMENTS spokes of the domain as one path */
  readonly spokes: string;
  /** the wedge the overlay dims when another domain is in focus */
  readonly wedge: string;
}
interface PlacedLeaf {
  readonly leaf: GraphLeaf;
  readonly angle: number;
  readonly r: number;
  readonly x: number;
  readonly y: number;
  readonly transform: string;
  /** the IMPLEMENTS spoke, from the arc's outer edge to the mark */
  readonly spoke: { readonly x1: string; readonly y1: string };
}
interface Sector {
  readonly cat: GraphCat;
  readonly a0: number;
  readonly a1: number;
  readonly path: string;
  readonly labelPath: string;
}

/** SVG user units. */
const SIZE = 760;
const C = SIZE / 2;
const MASTER_R = 30;
const SECTOR_R0 = 118;
const SECTOR_R1 = 330;
const ARC_R0 = 130;
const ARC_R1 = 156;
const LEAF_R = 231;
const LEAF_R_IN = 222;
const LEAF_R_OUT = 240;
const TICK_R0 = 250;
const TICK_R1 = 290;
const LABEL_R = 290;
const CAT_LABEL_R = 352;
const CHORD_R = 110;
/** degrees */
const CAT_GAP = 5;
const DOMAIN_GAP = 1.2;
/** every domain gets this many units on top of its fan-out, so a one-component
 * domain is still an arc a finger can hit */
const SPAN_PAD = 3;

const CAT_ORDER: readonly GraphCat[] = ['app', 'infra', 'quality'];
const CAT_STYLE: Readonly<Record<GraphCat, { hue: string; tint: string; strong: string }>> = {
  app: { hue: '#E04A28', tint: '#FFF1ED', strong: '#B83A1F' },
  infra: { hue: '#1E3A8A', tint: '#F0F2F8', strong: '#0F1F44' },
  quality: { hue: '#10B981', tint: '#ECFDF5', strong: '#047857' },
};
const ROLE_LETTER: Readonly<Record<GraphRole, string>> = {
  controller: 'C',
  configuration: 'F',
  security: 'S',
  implementation: 'I',
  diagnostics: 'D',
  lifecycle: 'L',
};
const ROLE_NAME: Readonly<Record<GraphRole, string>> = {
  controller: 'Controller',
  configuration: 'Configuration',
  security: 'Security',
  implementation: 'Implementation',
  diagnostics: 'Diagnostics',
  lifecycle: 'Lifecycle',
};
/** Role glyphs, 7 px across, drawn at the origin. Shape is the role's channel
 * (hue is the category's): circle Implementation, square Controller, diamond
 * Configuration, hexagon Security, ring Diagnostics, triangle Lifecycle. */
const GLYPH: Readonly<Record<GraphRole, string>> = {
  implementation: 'M0,-3.6 A3.6,3.6 0 1,1 0,3.6 A3.6,3.6 0 1,1 0,-3.6 Z',
  controller: 'M-3.4,-3.4 H3.4 V3.4 H-3.4 Z',
  configuration: 'M0,-4.4 L4.4,0 L0,4.4 L-4.4,0 Z',
  security: 'M0,-4.2 L3.6,-2.1 L3.6,2.1 L0,4.2 L-3.6,2.1 L-3.6,-2.1 Z',
  diagnostics: 'M0,-4 A4,4 0 1,1 0,4 A4,4 0 1,1 0,-4 Z M0,-2 A2,2 0 1,0 0,2 A2,2 0 1,0 0,-2 Z',
  lifecycle: 'M0,-4.4 L4.2,3.2 L-4.2,3.2 Z',
};

const rad = (deg: number): number => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number): { x: number; y: number } => ({
  x: C + r * Math.cos(rad(deg)),
  y: C + r * Math.sin(rad(deg)),
});
const f = (n: number): string => n.toFixed(2);
/** Annular sector from a0 to a1 (clockwise, degrees from the top). */
function annulus(r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > 180 ? 1 : 0;
  const o0 = pt(r1, a0);
  const o1 = pt(r1, a1);
  const i0 = pt(r0, a0);
  const i1 = pt(r0, a1);
  return (
    `M${f(o0.x)},${f(o0.y)} A${r1},${r1} 0 ${large},1 ${f(o1.x)},${f(o1.y)} ` +
    `L${f(i1.x)},${f(i1.y)} A${r0},${r0} 0 ${large},0 ${f(i0.x)},${f(i0.y)} Z`
  );
}

/**
 * A value placed inside a single-quoted Cypher string literal.
 *
 * Backslash first, then the quote. The other order is the bug: escaping `'` as `\\'` on a value
 * that already contains a backslash produces `\\\\'`, where the backslash escapes the backslash and
 * the quote closes the literal — everything after it is query. CodeQL reports the one-step version
 * as js/incomplete-sanitization.
 *
 * Nothing user-supplied reaches this today; the names come from a committed fixture. It is a
 * snippet the reader is invited to copy, on a page about how the system is built, which is reason
 * enough for it to be right.
 */
function cypherLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

@Component({
  selector: 'app-graph-topology-showcase',
  imports: [
    MatIconModule,
    NgTemplateOutlet,
    UpperCasePipe,
    TranslocoPipe,
    SurveyCardComponent,
    CodePanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    <app-survey-card
      tag="KNOWLEDGE GRAPH"
      [title]="'landing.survey.graphtopo.title' | transloco"
      [subtitle]="'landing.survey.graphtopo.subtitle' | transloco"
    >
      <!-- stat row -->
      <div class="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5">
        @for (s of stats; track s.key) {
          <div class="rounded-xl border border-beige bg-cream p-4 text-center">
            <div class="text-2xl font-bold text-coral-600 tabular-nums">{{ s.value }}</div>
            <div class="mt-1 text-[11px] font-medium text-slate2">
              {{ 'landing.survey.graphtopo.stats.' + s.key | transloco }}
            </div>
          </div>
        }
      </div>

      <!-- the map + the inspector -->
      <div class="mt-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.graphtopo.map.label' | transloco }}
        </p>
        <p class="hidden text-[11px] text-slate2 md:block">
          {{ 'landing.survey.graphtopo.map.hint' | transloco }}
        </p>
      </div>
      <div class="mt-3 grid gap-4 xl:grid-cols-[1.35fr_1fr] xl:items-start">
        <!-- the radial map (md and up) -->
        <!-- Two layers. The base is painted once and never mutated: sectors,
             spokes, marks, arcs, labels. The overlay holds only what a hover or
             a pin changes — a few flat fills, no text — so a hover repaints a
             few wedges, not a million pixels of rotated type. The pointer is
             resolved by geometry in one listener outside Angular's zone. -->
        <div
          #mapWrap
          class="gt-mapwrap relative hidden rounded-2xl border border-beige bg-white p-2 md:block"
          data-testid="graphtopo-map"
          [style.cursor]="hover() ? 'pointer' : null"
        >
          <svg
            [attr.viewBox]="'0 0 ' + SIZE + ' ' + SIZE"
            class="gt-base h-auto w-full"
            role="group"
            [attr.aria-label]="'landing.survey.graphtopo.topology.caption' | transloco"
            data-testid="graphtopo-svg"
          >
            <defs>
              @for (s of sectors; track s.cat) {
                <path [attr.id]="'gt-cat-' + s.cat" [attr.d]="s.labelPath" fill="none" />
              }
            </defs>

            <!-- category sectors: the subsystem division -->
            @for (s of sectors; track s.cat) {
              <path
                [attr.d]="s.path"
                [attr.fill]="cat[s.cat].tint"
                class="gt-sector"
                [attr.data-cat]="s.cat"
              />
              <text
                class="font-mono"
                font-size="10"
                font-weight="600"
                letter-spacing="1.6"
                [attr.fill]="cat[s.cat].strong"
              >
                <textPath [attr.href]="'#gt-cat-' + s.cat" startOffset="50%" text-anchor="middle">
                  {{ 'landing.survey.graphtopo.topology.cats.' + s.cat | transloco | uppercase }}
                </textPath>
              </text>
            }

            <!-- GUIDES: master → every domain -->
            @for (p of placed; track p.domain.key) {
              <line
                [attr.x1]="C"
                [attr.y1]="C"
                [attr.x2]="p.guideEnd.x"
                [attr.y2]="p.guideEnd.y"
                stroke="#E8E2D5"
                stroke-width="1.2"
              />
            }

            <!-- IMPLEMENTS: one path of spokes per domain, then the leaves -->
            @for (p of placed; track p.domain.key) {
              <path
                [attr.d]="p.spokes"
                fill="none"
                [attr.stroke]="p.hue"
                stroke-opacity="0.18"
                stroke-width="1"
              />
            }

            <!-- typed relationships: chords inside their domain -->
            @for (e of chords; track e.edge.from + '>' + e.edge.to) {
              <path [attr.d]="e.d" fill="none" class="gt-chord" />
            }

            @for (p of placed; track p.domain.key) {
              <g class="gt-leaves" [attr.data-domain]="p.domain.key">
                @for (l of p.leaves; track l.leaf.id) {
                  <g [attr.transform]="l.transform" class="gt-leaf" [attr.data-leaf]="l.leaf.id">
                    <title>{{ l.leaf.name }}</title>
                    @if (l.leaf.role; as role) {
                      <path
                        [attr.d]="glyph[role]"
                        [attr.fill]="p.hue"
                        fill-rule="evenodd"
                        stroke="#ffffff"
                        stroke-width="0.8"
                      />
                    } @else {
                      <circle r="3" [attr.fill]="p.hue" fill-opacity="0.55" />
                    }
                    <circle r="7" fill="transparent" />
                  </g>
                }
              </g>
            }

            <!-- the domain arcs (level 2), sized by what they implement -->
            @for (p of placed; track p.domain.key) {
              <g
                class="gt-arc"
                role="button"
                tabindex="0"
                [attr.aria-label]="p.domain.name + ' · ' + p.fan"
                [attr.aria-pressed]="isPinnedDomain(p.domain.key)"
                [attr.data-domain]="p.domain.key"
                (keydown.enter)="pin({ kind: 'domain', key: p.domain.key })"
                (keydown.space)="
                  pin({ kind: 'domain', key: p.domain.key }); $event.preventDefault()
                "
              >
                <path [attr.d]="p.arcPath" [attr.fill]="p.hue" class="gt-arc-fill" />
                <text
                  [attr.x]="p.fanAt.x"
                  [attr.y]="p.fanAt.y"
                  text-anchor="middle"
                  class="font-mono"
                  font-size="10"
                  font-weight="700"
                  fill="#ffffff"
                >
                  {{ p.fan }}
                </text>
                <line
                  [attr.x1]="p.tick.x1"
                  [attr.y1]="p.tick.y1"
                  [attr.x2]="p.tick.x2"
                  [attr.y2]="p.tick.y2"
                  stroke="#E8E2D5"
                  stroke-width="1"
                />
                <text
                  [attr.transform]="p.labelTransform"
                  [attr.text-anchor]="p.labelAnchor"
                  font-size="10.5"
                  font-weight="600"
                  fill="#0E1116"
                  class="gt-label"
                >
                  @for (line of p.labelLines; track $index; let first = $first) {
                    <tspan x="0" [attr.dy]="first ? (p.labelLines.length > 1 ? -2 : 4) : 12">
                      {{ line }}
                    </tspan>
                  }
                </text>
              </g>
            }

            <!-- level 1: the master -->
            <g
              class="gt-master"
              role="button"
              tabindex="0"
              [attr.aria-label]="master.name"
              [attr.aria-pressed]="focus().kind === 'master'"
              (keydown.enter)="pin({ kind: 'master' })"
              data-testid="graphtopo-master"
            >
              <circle [attr.cx]="C" [attr.cy]="C" [attr.r]="MASTER_R" fill="#FF5A36" />
              <text
                [attr.x]="C"
                [attr.y]="C + 4"
                text-anchor="middle"
                class="font-mono"
                font-size="12"
                font-weight="700"
                fill="#ffffff"
              >
                1
              </text>
              <text
                [attr.x]="C"
                [attr.y]="C + MASTER_R + 26"
                text-anchor="middle"
                font-size="11"
                font-weight="600"
                fill="#0E1116"
              >
                NavigationMaster
              </text>
            </g>
          </svg>
          <!-- the overlay: only what changes -->
          <svg
            [attr.viewBox]="'0 0 ' + SIZE + ' ' + SIZE"
            class="gt-overlay"
            aria-hidden="true"
            data-testid="graphtopo-overlay"
          >
            <defs>
              <marker
                id="gt-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,0.5 L7,4 L0,7.5 Z" fill="#0E1116" />
              </marker>
            </defs>
            @for (p of placed; track p.domain.key) {
              <path
                [attr.d]="p.wedge"
                fill="#FBF9F4"
                class="gt-wedge"
                [attr.fill-opacity]="dimDomain(p.domain.key) ? 0.55 : 0"
                [attr.data-domain]="p.domain.key"
              />
            }
            <path
              [attr.d]="BAND"
              fill="#FBF9F4"
              class="gt-wedge"
              [attr.fill-opacity]="roleHighlight() ? 0.7 : 0"
              data-testid="graphtopo-role-veil"
            />
            @for (m of roleMarks(); track m.id) {
              <path
                [attr.transform]="m.transform"
                [attr.d]="m.d"
                [attr.fill]="m.hue"
                fill-rule="evenodd"
                stroke="#0E1116"
                stroke-width="0.8"
              />
            }
            @for (c of litChords(); track c.edge.from + '>' + c.edge.to) {
              <path [attr.d]="c.d" fill="none" class="gt-lit" marker-end="url(#gt-arrow)" />
            }
            @if (shownDomain(); as p) {
              <path
                [attr.d]="p.arcPath"
                fill="none"
                stroke="#0E1116"
                stroke-width="2"
                data-testid="graphtopo-active-arc"
              />
            }
            @if (activeMark(); as m) {
              <circle
                [attr.cx]="m.x"
                [attr.cy]="m.y"
                r="7.5"
                fill="none"
                stroke="#0E1116"
                stroke-width="1.6"
              />
            }
          </svg>
          <div class="gt-halo" aria-hidden="true"></div>
        </div>

        <!-- the accordion (below md): same data, same focus -->
        <div class="min-w-0 md:hidden" data-testid="graphtopo-accordion">
          @for (s of sectors; track s.cat) {
            <p
              class="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]"
              [style.color]="cat[s.cat].strong"
            >
              {{ 'landing.survey.graphtopo.topology.cats.' + s.cat | transloco }}
            </p>
            <div class="mt-1.5 space-y-1.5">
              @for (p of placedIn(s.cat); track p.domain.key) {
                <div class="rounded-xl border border-beige bg-cream">
                  <button
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                    [attr.aria-expanded]="openDomain() === p.domain.key"
                    (click)="toggleDomain(p.domain.key)"
                    [attr.data-domain]="p.domain.key"
                  >
                    <span
                      class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      [style.background]="cat[p.domain.cat].hue"
                    ></span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-semibold text-ink">{{ p.domain.name }}</span>
                      <span class="block truncate text-[11px] text-slate2">
                        {{ p.domain.ai_description }}
                      </span>
                    </span>
                    <span class="font-mono text-[11px] text-slate2 tabular-nums">{{ p.fan }}</span>
                    <mat-icon
                      class="!h-4 !w-4 !text-base text-slate2 transition-transform"
                      [class.rotate-180]="openDomain() === p.domain.key"
                    >
                      expand_more
                    </mat-icon>
                  </button>
                  @if (openDomain() === p.domain.key) {
                    <div class="border-t border-beige p-3">
                      <ng-container [ngTemplateOutlet]="inspector" />
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- the inspector (md and up) -->
        <div class="hidden min-w-0 md:block xl:sticky xl:top-24">
          <ng-container [ngTemplateOutlet]="inspector" />
        </div>
      </div>

      <!-- category legend + the honest line about roles -->
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        @for (c of CAT_ORDER; track c) {
          <span
            class="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate2"
          >
            <span
              class="inline-block h-2.5 w-2.5 rounded-full"
              [style.background]="cat[c].hue"
            ></span>
            {{ 'landing.survey.graphtopo.topology.cats.' + c | transloco }}
          </span>
        }
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-slate2" data-testid="graphtopo-vintage">
        {{ 'landing.survey.graphtopo.map.vintage' | transloco }}
      </p>

      <!-- the inspector, once -->
      <ng-template #inspector>
        <div
          class="rounded-2xl border border-beige bg-white p-4 shadow-sm"
          data-testid="graphtopo-inspector"
          [attr.data-kind]="shown().kind"
        >
          <p class="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
            {{ 'landing.survey.graphtopo.map.inspector.title' | transloco }}
          </p>
          @switch (shown().kind) {
            @case ('master') {
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="gt-kind bg-coral-600">NavigationMaster</span>
                <span class="text-sm font-semibold text-ink" data-testid="graphtopo-inspector-name">
                  {{ master.name }}
                </span>
              </div>
              <dl class="gt-props">
                <dt>ai_description</dt>
                <dd>{{ master.ai_description }}</dd>
                <dt>angle</dt>
                <dd>{{ master.angle }}</dd>
                <dt>rebuilt</dt>
                <dd>{{ master.rebuilt }}</dd>
              </dl>
              <p class="gt-rel-label">
                {{ 'landing.survey.graphtopo.map.inspector.relations' | transloco }}
              </p>
              <p class="gt-rel">
                <span class="font-mono">GUIDES →</span>
                {{ placed.length }}
                {{ 'landing.survey.graphtopo.map.inspector.domains' | transloco }}
              </p>
              <div class="mt-1.5 flex flex-wrap gap-1">
                @for (p of placed; track p.domain.key) {
                  <button
                    type="button"
                    class="gt-chip"
                    (click)="pin({ kind: 'domain', key: p.domain.key })"
                    [attr.data-domain]="p.domain.key"
                  >
                    <span
                      class="inline-block h-2 w-2 rounded-full"
                      [style.background]="cat[p.domain.cat].hue"
                    ></span>
                    {{ p.domain.name }}
                  </button>
                }
              </div>
              <p class="gt-rel-label">
                {{ 'landing.survey.graphtopo.map.protocol.title' | transloco }}
              </p>
              <ol class="mt-1.5 space-y-1 text-[11px] leading-snug text-slate2">
                @for (i of [0, 1, 2, 3]; track i) {
                  <li class="flex gap-2">
                    <span class="font-mono text-coral-600">{{ i + 1 }}</span>
                    <span>
                      {{ 'landing.survey.graphtopo.map.protocol.steps.' + i | transloco }}
                    </span>
                  </li>
                }
              </ol>
            }
            @case ('domain') {
              @if (shownDomain(); as p) {
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span class="gt-kind bg-navy-500">EntityNavigator</span>
                  <span
                    class="text-sm font-semibold text-ink"
                    data-testid="graphtopo-inspector-name"
                  >
                    {{ p.domain.name }}
                  </span>
                  <span class="gt-cat" [style.color]="cat[p.domain.cat].strong">
                    {{ p.domain.cat }}
                  </span>
                </div>
                <dl class="gt-props">
                  <dt>ai_description</dt>
                  <dd data-testid="graphtopo-inspector-desc">{{ p.domain.ai_description }}</dd>
                  <dt>key</dt>
                  <dd>{{ p.domain.key }}</dd>
                </dl>
                <p class="gt-rel-label">
                  {{ 'landing.survey.graphtopo.map.inspector.relations' | transloco }}
                </p>
                <p class="gt-rel">
                  <span class="font-mono">GUIDES ←</span>
                  <button type="button" class="gt-chip" (click)="pin({ kind: 'master' })">
                    NavigationMaster
                  </button>
                </p>
                <p class="gt-rel">
                  <span class="font-mono">IMPLEMENTS →</span>
                  {{ p.fan }}
                  {{ 'landing.survey.graphtopo.map.inspector.components' | transloco }}
                  @if (roleSummary(p); as summary) {
                    <span class="font-mono text-slate2">· {{ summary }}</span>
                  }
                </p>
                <div class="mt-1.5 flex flex-wrap gap-1" data-testid="graphtopo-inspector-leaves">
                  @for (l of p.leaves; track l.leaf.id) {
                    <button
                      type="button"
                      class="gt-chip"
                      (click)="pin({ kind: 'leaf', id: l.leaf.id })"
                      [attr.data-leaf]="l.leaf.id"
                    >
                      @if (l.leaf.role; as role) {
                        <span class="gt-role">{{ roleLetter[role] }}</span>
                      }
                      {{ l.leaf.name }}
                    </button>
                  }
                </div>
                @if (domainEdges(p.domain.key); as edges) {
                  @if (edges.length) {
                    <ul class="mt-2 space-y-1.5" data-testid="graphtopo-inspector-edges">
                      @for (e of edges; track e.from + '>' + e.to) {
                        <li class="gt-edge text-[11px] leading-snug text-slate2">
                          <span class="font-mono text-ink">{{ leafName(e.from) }}</span>
                          <span class="gt-arrow font-mono text-coral-600">-{{ e.type }}→</span>
                          <span class="font-mono text-ink">{{ leafName(e.to) }}</span>
                          <span class="block text-slate2">{{ e.ai_context }}</span>
                        </li>
                      }
                    </ul>
                  }
                }
              }
            }
            @case ('leaf') {
              @if (shownLeaf(); as l) {
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span class="gt-kind bg-success-strong">ConcreteImpl</span>
                  <span
                    class="text-sm font-semibold text-ink"
                    data-testid="graphtopo-inspector-name"
                  >
                    {{ l.leaf.name }}
                  </span>
                  <span class="gt-cat text-slate2">{{ l.leaf.status }}</span>
                </div>
                <dl class="gt-props">
                  <dt>ai_description</dt>
                  <dd data-testid="graphtopo-inspector-desc">{{ l.leaf.ai_description }}</dd>
                  @if (l.leaf.why) {
                    <dt>why</dt>
                    <dd>{{ l.leaf.why }}</dd>
                  }
                  @if (l.leaf.role; as role) {
                    <dt>behavioral_category</dt>
                    <dd>
                      <span class="gt-role">{{ roleLetter[role] }}</span>
                      {{ roleName[role] }}
                    </dd>
                  }
                  <dt>path</dt>
                  <dd class="break-all">{{ l.leaf.path }}</dd>
                </dl>
                <p class="gt-rel-label">
                  {{ 'landing.survey.graphtopo.map.inspector.relations' | transloco }}
                </p>
                <p class="gt-rel">
                  <span class="font-mono">IMPLEMENTS ←</span>
                  <button
                    type="button"
                    class="gt-chip"
                    (click)="pin({ kind: 'domain', key: l.domain.domain.key })"
                  >
                    <span
                      class="inline-block h-2 w-2 rounded-full"
                      [style.background]="cat[l.domain.domain.cat].hue"
                    ></span>
                    {{ l.domain.domain.name }}
                  </button>
                </p>
                @if (leafEdges(l.leaf.id); as edges) {
                  @if (edges.length) {
                    <ul class="mt-2 space-y-1.5" data-testid="graphtopo-inspector-edges">
                      @for (e of edges; track e.from + '>' + e.to) {
                        <li class="gt-edge text-[11px] leading-snug text-slate2">
                          @if (e.from === l.leaf.id) {
                            <span class="gt-arrow font-mono text-coral-600">-{{ e.type }}→</span>
                            <button
                              type="button"
                              class="gt-link"
                              (click)="pin({ kind: 'leaf', id: e.to })"
                            >
                              {{ leafName(e.to) }}
                            </button>
                          } @else {
                            <button
                              type="button"
                              class="gt-link"
                              (click)="pin({ kind: 'leaf', id: e.from })"
                            >
                              {{ leafName(e.from) }}
                            </button>
                            <span class="gt-arrow font-mono text-coral-600">-{{ e.type }}→</span>
                          }
                          <span class="block text-slate2">{{ e.ai_context }}</span>
                        </li>
                      }
                    </ul>
                  }
                }
              }
            }
          }
          <p class="gt-rel-label">
            {{ 'landing.survey.graphtopo.map.inspector.query' | transloco }}
          </p>
          <pre
            class="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-navy-900 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-cream/90"
            data-testid="graphtopo-inspector-cypher"
            >{{ cypher() }}</pre>
          @if (focus().kind !== 'master') {
            <button
              type="button"
              class="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-coral-600 underline"
              (click)="pin({ kind: 'master' })"
              data-testid="graphtopo-inspector-back"
            >
              <mat-icon class="!h-3.5 !w-3.5 !text-sm">close</mat-icon>
              {{ 'landing.survey.graphtopo.map.inspector.back' | transloco }}
            </button>
          }
        </div>
      </ng-template>

      <!-- 6-entity behavioural lens: hover a role, its glyphs light on the map -->
      <p class="mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.graphtopo.roles.label' | transloco }}
      </p>
      <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        @for (r of roles; track r.key) {
          <div
            class="rounded-xl border border-beige bg-cream p-3.5 transition hover:border-coral-200"
            (mouseenter)="roleHighlight.set(r.key)"
            (mouseleave)="roleHighlight.set(null)"
            [attr.data-role]="r.key"
          >
            <div class="flex items-center gap-2">
              <span
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-coral-700 font-mono text-xs font-bold text-white shadow-sm"
              >
                {{ r.sym }}
              </span>
              <svg viewBox="-6 -6 12 12" class="h-4 w-4 shrink-0" aria-hidden="true">
                <path [attr.d]="glyph[r.key]" fill="#E04A28" fill-rule="evenodd" />
              </svg>
              <span class="text-sm font-semibold text-ink">{{ r.name }}</span>
              <span class="ml-auto font-mono text-[11px] text-slate2 tabular-nums">
                {{ roleCount(r.key) }}
              </span>
            </div>
            <p class="mt-2 text-[11px] leading-snug text-slate2">
              {{ 'landing.survey.graphtopo.roles.' + r.key + '.look' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- what an answer costs: one graph hop against search-and-read -->
      <p class="mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.graphtopo.cost.label' | transloco }}
      </p>
      <p class="mt-2 text-xs leading-relaxed text-slate2">
        {{ 'landing.survey.graphtopo.cost.intro' | transloco }}
      </p>
      <div
        class="mt-3 overflow-x-auto rounded-2xl border border-beige bg-white"
        data-testid="graphtopo-cost"
      >
        <table class="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr
              class="border-b border-beige font-mono text-[10px] uppercase tracking-[0.14em] text-slate2"
            >
              <th class="px-4 py-2.5 font-medium">
                {{ 'landing.survey.graphtopo.cost.colQuestion' | transloco }}
              </th>
              <th class="px-4 py-2.5 font-medium">
                {{ 'landing.survey.graphtopo.cost.colGraph' | transloco }}
              </th>
              <th class="px-4 py-2.5 font-medium">
                {{ 'landing.survey.graphtopo.cost.colSearch' | transloco }}
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                {{ 'landing.survey.graphtopo.cost.colRatio' | transloco }}
              </th>
            </tr>
          </thead>
          <tbody>
            @for (q of cost.questions; track q.key) {
              <tr
                class="border-b border-beige/70 last:border-0 align-top"
                [attr.data-question]="q.key"
              >
                <td class="px-4 py-3 font-medium text-ink">
                  {{ 'landing.survey.graphtopo.cost.questions.' + q.key | transloco }}
                </td>
                <td class="px-4 py-3 font-mono text-[11px] text-ink">
                  {{ q.graph.hops }} {{ 'landing.survey.graphtopo.cost.hop' | transloco }} ·
                  {{ q.graph.nodes }} {{ 'landing.survey.graphtopo.cost.nodes' | transloco }} ·
                  <span class="font-semibold text-coral-700">~{{ q.graph.tokens }} tok</span>
                  · &lt;1 ms
                </td>
                <td class="px-4 py-3 font-mono text-[11px] text-slate2">
                  {{ q.search.files }} {{ 'landing.survey.graphtopo.cost.files' | transloco }} ·
                  {{ kb(q.search.bytes) }} KB ·
                  <span class="font-semibold text-ink">~{{ q.search.tokens }} tok</span>
                  · {{ q.search.ms }} ms
                </td>
                <td
                  class="px-4 py-3 text-right font-mono text-sm font-bold text-coral-600 tabular-nums"
                >
                  ×{{ q.ratio }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-slate2" data-testid="graphtopo-cost-note">
        {{
          'landing.survey.graphtopo.cost.note'
            | transloco
              : { date: cost.measuredAt, files: cost.backend.javaFiles, mb: mb(cost.backend.bytes) }
        }}
      </p>

      <!-- one query → the whole system's shape -->
      <p class="mt-8 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
        {{ 'landing.survey.graphtopo.query.label' | transloco }}
      </p>
      <div class="mt-3">
        <app-code-panel file="CheckItOutSystem · Neo4j">{{ querySnippet }}</app-code-panel>
      </div>
      <p class="mt-2 text-[11px] leading-relaxed text-slate2">
        {{ 'landing.survey.graphtopo.query.caption' | transloco }}
      </p>

      <!-- complexity argument + spectral methods at scale -->
      <div class="mt-8 rounded-2xl border border-beige bg-white p-5 shadow-sm">
        <div class="flex items-start gap-3">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white shadow-sm"
          >
            <mat-icon class="!h-5 !w-5 !text-xl">bolt</mat-icon>
          </span>
          <div>
            <div class="text-sm font-semibold text-ink">
              {{ 'landing.survey.graphtopo.math.complexityTitle' | transloco }}
            </div>
            <p class="mt-1 text-xs leading-relaxed text-slate2">
              {{ 'landing.survey.graphtopo.math.complexityBody' | transloco }}
            </p>
          </div>
        </div>

        <p class="mt-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate2">
          {{ 'landing.survey.graphtopo.math.label' | transloco }}
        </p>
        <div class="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          @for (m of methods; track m.key) {
            <div class="flex items-start gap-2.5 rounded-xl border border-beige bg-cream p-3">
              <mat-icon class="!h-5 !w-5 !text-xl shrink-0 text-coral-600">{{ m.icon }}</mat-icon>
              <div class="min-w-0">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <span class="text-sm font-semibold text-ink">{{ m.name }}</span>
                  <span class="font-mono text-[10px] text-slate2">{{ m.param }}</span>
                </div>
                <p class="mt-0.5 text-[11px] leading-snug text-slate2">
                  {{ 'landing.survey.graphtopo.math.' + m.key | transloco }}
                </p>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- the throughline: the model IS the goal -->
      <div class="mt-6 rounded-xl border border-coral-100 bg-coral-50 p-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-coral-500 text-white shadow-sm"
          >
            <mat-icon class="!h-4 !w-4 !text-base">visibility</mat-icon>
          </span>
          <span class="text-sm font-semibold text-ink">
            {{ 'landing.survey.graphtopo.throughline.title' | transloco }}
          </span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-slate2">
          {{ 'landing.survey.graphtopo.throughline.body' | transloco }}
        </p>
        <a
          [href]="repoUrl"
          target="_blank"
          rel="noopener"
          class="mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-coral-600 underline-offset-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
        >
          {{ 'landing.survey.graphtopo.throughline.cta' | transloco }}
          <mat-icon class="!h-4 !w-4 !text-base">open_in_new</mat-icon>
        </a>
      </div>

      <p class="mt-4 text-[11px] text-slate2">
        {{ 'landing.survey.graphtopo.snapshot' | transloco }}
      </p>
    </app-survey-card>
  `,
  styles: [
    `
      /* The base layer is painted once and promoted to its own compositor
         layer; nothing inside it changes after mount. The overlay carries the
         state — flat fills only — and the halo lives in HTML so its pulse is
         composited instead of repainting the drawing sixty times a second. */
      .gt-mapwrap {
        contain: layout paint;
      }
      .gt-base {
        will-change: transform;
      }
      .gt-overlay {
        position: absolute;
        inset: 0.5rem;
        pointer-events: none;
      }
      .gt-wedge {
        transition: fill-opacity 0.15s ease;
      }
      .gt-chord {
        stroke: #0e1116;
        stroke-opacity: 0.2;
        stroke-width: 1;
      }
      .gt-lit {
        stroke: #0e1116;
        stroke-opacity: 0.9;
        stroke-width: 1.8;
      }
      .gt-arc,
      .gt-master {
        outline: none;
      }
      .gt-arc:focus-visible .gt-arc-fill {
        stroke: #0e1116;
        stroke-width: 2;
      }
      .gt-halo {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 10.5%;
        aspect-ratio: 1;
        border-radius: 9999px;
        border: 1.5px solid rgba(255, 90, 54, 0.35);
        transform: translate(-50%, -50%);
        will-change: transform, opacity;
        pointer-events: none;
        animation: gt-halo 3s ease-in-out infinite;
      }
      @keyframes gt-halo {
        0%,
        100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0.9;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.12);
          opacity: 0.35;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .gt-halo {
          animation: none;
        }
      }
      /* the inspector: a node's properties the way the graph holds them */
      .gt-kind {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #ffffff;
      }
      .gt-cat {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      .gt-props {
        margin-top: 0.75rem;
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        column-gap: 0.75rem;
        row-gap: 0.35rem;
        align-items: baseline;
      }
      .gt-props dt {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        letter-spacing: 0.06em;
        color: #4a4f5c;
      }
      .gt-props dd {
        margin: 0;
        font-size: 12px;
        line-height: 1.5;
        color: #0e1116;
      }
      .gt-rel-label {
        margin-top: 1rem;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10px;
        font-weight: 500;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #4a4f5c;
      }
      .gt-rel {
        margin-top: 0.4rem;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem;
        font-size: 12px;
        color: #0e1116;
      }
      .gt-rel .font-mono {
        font-size: 11px;
        color: #b83a1f;
      }
      .gt-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 3px 8px;
        border-radius: 0.5rem;
        background: #fbf9f4;
        box-shadow: inset 0 0 0 1px #e8e2d5;
        font-size: 11px;
        font-weight: 500;
        color: #0e1116;
        text-align: left;
        transition:
          box-shadow 0.15s ease,
          background 0.15s ease;
      }
      .gt-chip:hover,
      .gt-chip:focus-visible {
        background: #ffffff;
        box-shadow: inset 0 0 0 1px #ffa07b;
        outline: none;
      }
      .gt-role {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1rem;
        height: 1rem;
        border-radius: 0.25rem;
        background: #b83a1f;
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 9px;
        font-weight: 700;
        color: #ffffff;
      }
      .gt-link {
        font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        color: #0e1116;
        text-decoration: underline;
        text-decoration-color: #e8e2d5;
        text-underline-offset: 2px;
      }
      .gt-link:hover {
        color: #b83a1f;
      }
      .gt-edge {
        overflow-wrap: anywhere;
      }
      .gt-arrow {
        margin: 0 0.3em;
      }
    `,
  ],
})
export class GraphTopologyShowcaseComponent {
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly mapWrap = viewChild<ElementRef<HTMLDivElement>>('mapWrap');
  readonly repoUrl = GRAPH_REPO_URL;
  /** the ring the marks sit in, for the role veil */
  readonly BAND =
    annulus(LEAF_R_IN - 14, LEAF_R_OUT + 14, 0, 180) +
    ' ' +
    annulus(LEAF_R_IN - 14, LEAF_R_OUT + 14, 180, 359.99);
  readonly SIZE = SIZE;
  readonly C = C;
  readonly MASTER_R = MASTER_R;
  readonly CAT_ORDER = CAT_ORDER;
  readonly cat = CAT_STYLE;
  readonly glyph = GLYPH;
  readonly roleLetter = ROLE_LETTER;
  readonly roleName = ROLE_NAME;

  // Real snapshot of the live Neo4j CheckItOutSystem namespace (re-queried
  // 2026-09-02). `roles` is the 6-entity reading lens, not a node count.
  readonly stats = [
    { key: 'nodes', value: '146' },
    { key: 'rels', value: '167' },
    { key: 'relTypes', value: '8' },
    { key: 'levels', value: '3' },
    { key: 'roles', value: '6' },
  ];

  readonly master = GRAPH_DATA.master;
  readonly data = GRAPH_DATA;
  /** Measured by tools/measure-graph-vs-grep.mjs; the card prints it, never types it. */
  readonly cost = GRAPH_COST;
  kb(bytes: number): number {
    return Math.round(bytes / 1024);
  }
  mb(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1);
  }

  /** The domains laid out around the ring: angles from the top, clockwise. */
  readonly placed: readonly Placed[] = layout();
  readonly sectors: readonly Sector[] = CAT_ORDER.map((cat) => {
    const own = this.placed.filter((p) => p.domain.cat === cat);
    const a0 = own[0].a0 - DOMAIN_GAP;
    const a1 = own[own.length - 1].a1 + DOMAIN_GAP;
    return {
      cat,
      a0,
      a1,
      path: annulus(SECTOR_R0, SECTOR_R1, a0, a1),
      labelPath: catLabelPath(a0, a1),
    };
  });
  private readonly leafById = new Map(
    this.placed.flatMap((p) => p.leaves.map((l) => [l.leaf.id, { placed: p, leaf: l }] as const)),
  );
  /** The 22 typed relationships as chords inside their sector. */
  readonly chords = GRAPH_DATA.edges.map((edge) => {
    const a = this.leafById.get(edge.from)?.leaf;
    const b = this.leafById.get(edge.to)?.leaf;
    if (!a || !b) return { edge, d: '' };
    const c = pt(CHORD_R, (a.angle + b.angle) / 2);
    return { edge, d: `M${f(a.x)},${f(a.y)} Q${f(c.x)},${f(c.y)} ${f(b.x)},${f(b.y)}` };
  });

  /** What is pinned (click / keyboard); the master until something is. */
  readonly focus = signal<Focus>({ kind: 'master' });
  /** What the pointer is over; a preview that never unpins anything. */
  readonly hover = signal<Focus | null>(null);
  readonly shown = computed<Focus>(() => this.hover() ?? this.focus());
  readonly roleHighlight = signal<GraphRole | null>(null);
  /** The accordion's open row (below md). */
  readonly openDomain = signal<string | null>(null);

  readonly shownDomain = computed<Placed | null>(() => {
    const s = this.shown();
    if (s.kind === 'domain') return this.placed.find((p) => p.domain.key === s.key) ?? null;
    if (s.kind === 'leaf') return this.leafById.get(s.id)?.placed ?? null;
    return null;
  });
  /** The mark under focus, with its position, for the overlay's ring. */
  readonly activeMark = computed<PlacedLeaf | null>(() => {
    const s = this.shown();
    return s.kind === 'leaf' ? (this.leafById.get(s.id)?.leaf ?? null) : null;
  });
  /** The chords the overlay redraws lit: a focused domain's, or a focused mark's. */
  readonly litChords = computed(() => this.chords.filter((c) => this.litEdge(c.edge)));
  /** A highlighted role's glyphs, redrawn on top of the veil. */
  readonly roleMarks = computed(() => {
    const role = this.roleHighlight();
    if (!role) return [] as { id: string; transform: string; d: string; hue: string }[];
    return this.placed.flatMap((p) =>
      p.leaves
        .filter((l) => l.leaf.role === role)
        .map((l) => ({ id: l.leaf.id, transform: l.transform, d: GLYPH[role], hue: p.hue })),
    );
  });
  readonly shownLeaf = computed<{ leaf: GraphLeaf; domain: Placed } | null>(() => {
    const s = this.shown();
    if (s.kind !== 'leaf') return null;
    const hit = this.leafById.get(s.id);
    return hit ? { leaf: hit.leaf.leaf, domain: hit.placed } : null;
  });
  /** The one-hop Cypher that fetches the card on screen. */
  readonly cypher = computed<string>(() => {
    const s = this.shown();
    if (s.kind === 'domain') {
      return `MATCH (e:EntityNavigator {key: '${cypherLiteral(s.key)}'})-[:IMPLEMENTS]->(c)\nRETURN c.name, c.ai_description`;
    }
    if (s.kind === 'leaf') {
      const name = this.leafById.get(s.id)?.leaf.leaf.name ?? s.id;
      return `MATCH (c:ConcreteImpl {name: '${cypherLiteral(name)}'})-[r]-(x)\nRETURN type(r), x.name, r.ai_context`;
    }
    return `MATCH (nav:NavigationMaster {namespace: 'CheckItOutSystem'})-[:GUIDES]->(e)\nRETURN e.name, e.category, e.ai_description`;
  });

  pin(target: Focus): void {
    this.focus.set(target);
    this.hover.set(null);
    // the accordion's row follows the master only; its own button opens it
    if (target.kind === 'master') this.openDomain.set(null);
  }
  constructor() {
    // One listener for the whole map, outside the zone: the pointer is turned
    // into (r, θ) and matched against the layout, and a signal is written only
    // when the thing under it changes. 130 mouseenter handlers each ticking
    // the page were the other half of the hover cost.
    afterNextRender(() => {
      const wrap = this.mapWrap()?.nativeElement;
      if (!wrap || !this.browser) return;
      const base = wrap.querySelector<SVGSVGElement>('svg.gt-base');
      if (!base) return;
      let lastKey = '';
      const at = (ev: PointerEvent | MouseEvent): Focus | null => {
        const box = base.getBoundingClientRect();
        if (box.width === 0) return null;
        const k = SIZE / box.width;
        return this.resolve((ev.clientX - box.left) * k, (ev.clientY - box.top) * k);
      };
      const keyOf = (f: Focus | null): string =>
        f === null
          ? ''
          : f.kind === 'master'
            ? 'master'
            : f.kind === 'domain'
              ? `d:${f.key}`
              : `l:${f.id}`;
      const onMove = (ev: PointerEvent): void => {
        const target = at(ev);
        const key = keyOf(target);
        if (key === lastKey) return;
        lastKey = key;
        this.hover.set(target);
      };
      const onLeave = (): void => {
        lastKey = '';
        this.hover.set(null);
      };
      const onClick = (ev: MouseEvent): void => {
        const target = at(ev);
        if (target) this.pin(target);
      };
      this.zone.runOutsideAngular(() => {
        wrap.addEventListener('pointermove', onMove, { passive: true });
        wrap.addEventListener('pointerleave', onLeave, { passive: true });
        wrap.addEventListener('click', onClick);
      });
      this.destroyRef.onDestroy(() => {
        wrap.removeEventListener('pointermove', onMove);
        wrap.removeEventListener('pointerleave', onLeave);
        wrap.removeEventListener('click', onClick);
      });
    });
  }
  /** What sits at a point of the drawing (SVG units): the master disc, a mark
   * within 9 units, the domain whose sector holds the angle, or nothing. */
  resolve(x: number, y: number): Focus | null {
    const dx = x - C;
    const dy = y - C;
    const r = Math.hypot(dx, dy);
    if (r <= MASTER_R + 10) return { kind: 'master' };
    if (r < SECTOR_R0 || r > SECTOR_R1) return null;
    const theta = ((((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360) + 360) % 360;
    const p = this.placed.find(
      (d) => theta >= d.a0 - DOMAIN_GAP / 2 && theta < d.a1 + DOMAIN_GAP / 2,
    );
    if (!p) return null;
    if (r >= LEAF_R_IN - 12 && r <= LEAF_R_OUT + 12) {
      let best: PlacedLeaf | null = null;
      let bestD = 9;
      for (const l of p.leaves) {
        const d = Math.hypot(l.x - x, l.y - y);
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
      if (best) return { kind: 'leaf', id: best.leaf.id };
    }
    return { kind: 'domain', key: p.domain.key };
  }
  onEscape(): void {
    if (this.focus().kind !== 'master' || this.hover() !== null) this.pin({ kind: 'master' });
  }
  toggleDomain(key: string): void {
    if (this.openDomain() === key) {
      this.openDomain.set(null);
      this.focus.set({ kind: 'master' });
    } else {
      this.openDomain.set(key);
      this.pin({ kind: 'domain', key });
    }
  }

  placedIn(cat: GraphCat): readonly Placed[] {
    return this.placed.filter((p) => p.domain.cat === cat);
  }
  /** A name longer than fourteen characters wraps onto a second line at a
   * word boundary, never leaving an ampersand or a slash dangling at a line's
   * end, so the longest domain names stay inside the drawing. */
  static labelLines(name: string): readonly string[] {
    if (name.length <= 14) return [name];
    // a slash-joined name (Legal/Consent/RODO) breaks after a slash
    const words = name.split(' ').flatMap((w) => w.split(/(?<=\/)/));
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? (line.endsWith('/') ? line + w : `${line} ${w}`) : w;
      if (next.length > 14 && line && !/&$/.test(line)) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  dimDomain(key: string): boolean {
    const d = this.shownDomain();
    return d !== null && d.domain.key !== key;
  }
  isPinnedDomain(key: string): boolean {
    const p = this.focus();
    return p.kind === 'domain' && p.key === key;
  }
  litEdge(e: GraphEdge): boolean {
    const s = this.shown();
    if (s.kind === 'leaf') return e.from === s.id || e.to === s.id;
    const d = this.shownDomain();
    return d !== null && (this.leafById.get(e.from)?.placed.domain.key ?? '') === d.domain.key;
  }
  domainEdges(key: string): readonly GraphEdge[] {
    return GRAPH_DATA.edges.filter((e) => this.leafById.get(e.from)?.placed.domain.key === key);
  }
  leafEdges(id: string): readonly GraphEdge[] {
    return GRAPH_DATA.edges.filter((e) => e.from === id || e.to === id);
  }
  leafName(id: string): string {
    return this.leafById.get(id)?.leaf.leaf.name ?? id;
  }
  roleSummary(p: Placed): string {
    const counts = new Map<GraphRole, number>();
    for (const l of p.leaves)
      if (l.leaf.role) counts.set(l.leaf.role, (counts.get(l.leaf.role) ?? 0) + 1);
    if (counts.size === 0) return '';
    return [...counts.entries()].map(([r, n]) => `${ROLE_LETTER[r]}${n}`).join(' ');
  }
  roleCount(role: GraphRole): number {
    return GRAPH_DATA.leaves.filter((l) => l.role === role).length;
  }

  // The 6-entity behavioural lens every subsystem is read through.
  readonly roles: readonly { key: GraphRole; sym: string; name: string }[] = (
    [
      'controller',
      'configuration',
      'security',
      'implementation',
      'diagnostics',
      'lifecycle',
    ] as const
  ).map((key) => ({ key, sym: ROLE_LETTER[key], name: ROLE_NAME[key] }));

  // Spectral + embedding methods on the same Neo4j substrate (at corpus scale).
  readonly methods = [
    { key: 'laplacian', icon: 'analytics', name: 'Magnetic Laplacian', param: 'Hermitian · g=1/4' },
    { key: 'fastrp', icon: 'memory', name: 'FastRP', param: 'm=64 · seed=42' },
    { key: 'leiden', icon: 'share', name: 'Leiden', param: 'communities' },
    { key: 'knn', icon: 'search', name: 'Vector kNN', param: 'cosine · 1472-d' },
  ];

  readonly querySnippet = `// one query → every subsystem and how big it is
MATCH (nav:NavigationMaster {namespace: 'CheckItOutSystem'})
      -[:GUIDES]->(e:EntityNavigator)-[:IMPLEMENTS]->(c:ConcreteImpl)
RETURN e.name AS subsystem, count(c) AS components
ORDER BY components DESC   // impact analysis before the change, not after the incident`;
}

/** Radial label at the mid angle, reading outward; flipped on the left half so
 * nothing is upside down (the hierarchical-edge-bundling flip). */
function labelTransform(mid: number, flip: boolean): string {
  return `rotate(${f(mid - 90)} ${C} ${C}) translate(${C + LABEL_R} ${C}) rotate(${flip ? 180 : 0})`;
}
/** The arc a category's name sits on; drawn the other way round on the bottom
 * half so the text is never upside down. */
function catLabelPath(a0: number, a1: number): string {
  const m = (a0 + a1) / 2;
  const bottom = m > 90 && m < 270;
  const from = bottom ? a1 : a0;
  const to = bottom ? a0 : a1;
  const p0 = pt(CAT_LABEL_R, from);
  const p1 = pt(CAT_LABEL_R, to);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${f(p0.x)},${f(p0.y)} A${CAT_LABEL_R},${CAT_LABEL_R} 0 ${large},${bottom ? 0 : 1} ${f(p1.x)},${f(p1.y)}`;
}

/**
 * Lay the fifteen domains around the ring. Each category gets a contiguous
 * run; a domain's span is proportional to its fan-out plus SPAN_PAD, so the
 * one-component domain is still an arc a finger can hit; the leaves sit at
 * even angles inside their domain, alternating between two radii when there
 * are eight or more so neighbours never touch.
 */
function layout(): readonly Placed[] {
  const domains = [...GRAPH_DATA.domains].sort(
    (a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat),
  );
  const leavesOf = new Map<string, GraphLeaf[]>();
  for (const l of GRAPH_DATA.leaves) leavesOf.set(l.domain, [...(leavesOf.get(l.domain) ?? []), l]);
  const cats = new Set(domains.map((d) => d.cat)).size;
  const units = domains.reduce((n, d) => n + (leavesOf.get(d.key)?.length ?? 0) + SPAN_PAD, 0);
  const degrees = 360 - cats * CAT_GAP - (domains.length - cats) * DOMAIN_GAP;
  const perUnit = degrees / units;
  const out: Placed[] = [];
  let a = CAT_GAP / 2;
  domains.forEach((domain, i) => {
    if (i > 0) a += domains[i - 1].cat === domain.cat ? DOMAIN_GAP : CAT_GAP;
    const leaves = leavesOf.get(domain.key) ?? [];
    const fan = leaves.length;
    const span = (fan + SPAN_PAD) * perUnit;
    const a0 = a;
    const a1 = a + span;
    const mid = (a0 + a1) / 2;
    const placedLeaves = leaves.map((leaf, k) => {
      const angle = a0 + ((k + 0.5) / fan) * span;
      const r = fan >= 8 ? (k % 2 === 0 ? LEAF_R_IN : LEAF_R_OUT) : LEAF_R;
      const { x, y } = pt(r, angle);
      const s0 = pt(ARC_R1, angle);
      return {
        leaf,
        angle,
        r,
        x,
        y,
        transform: `translate(${f(x)},${f(y)})`,
        spoke: { x1: f(s0.x), y1: f(s0.y) },
      };
    });
    const spokes = placedLeaves
      .map((l) => `M${l.spoke.x1},${l.spoke.y1} L${f(l.x)},${f(l.y)}`)
      .join(' ');
    const guide = pt(ARC_R0, mid);
    const fanAt = pt((ARC_R0 + ARC_R1) / 2, mid);
    const t0 = pt(TICK_R0, mid);
    const t1 = pt(TICK_R1, mid);
    const flip = mid % 360 > 180;
    out.push({
      domain,
      fan,
      a0,
      a1,
      mid,
      leaves: placedLeaves,
      arcPath: annulus(ARC_R0, ARC_R1, a0, a1),
      guideEnd: { x: f(guide.x), y: f(guide.y) },
      fanAt: { x: f(fanAt.x), y: f(fanAt.y + 3.5) },
      tick: { x1: f(t0.x), y1: f(t0.y), x2: f(t1.x), y2: f(t1.y) },
      labelTransform: labelTransform(mid, flip),
      labelAnchor: flip ? 'end' : 'start',
      labelLines: GraphTopologyShowcaseComponent.labelLines(domain.name),
      hue: CAT_STYLE[domain.cat].hue,
      spokes,
      wedge: annulus(SECTOR_R0, SECTOR_R1, a0 - DOMAIN_GAP / 2, a1 + DOMAIN_GAP / 2),
    });
    a = a1;
  });
  return out;
}
