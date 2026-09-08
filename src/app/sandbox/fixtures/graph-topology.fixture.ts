import { GraphTopologyShowcaseComponent } from '../../feature/survey/showcases/graph-topology-showcase.component';
import type { SandboxFixture } from '../sandbox-registry';

/**
 * The knowledge-graph map of the technical survey: one master, fifteen domain
 * arcs in three category sectors, 130 component marks, 22 chords, and the
 * inspector beside it. Pure data (generated from the Neo4j dump), no
 * providers. The desktop baseline holds the radial; the mobile project lays
 * the same fixture out at phone width, where the accordion replaces the map.
 */
export const GRAPH_TOPOLOGY_FIXTURES: readonly SandboxFixture[] = [
  {
    id: 'graph-topology',
    label: 'Survey · graph topology map + inspector',
    component: GraphTopologyShowcaseComponent,
    viewport: { width: 1180, height: 1500 },
  },
];
