import { memo, useMemo } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { Bot, KeyRound, PackageSearch, Wallet, Store, FileSearch, Gavel, ShieldCheck, Check, X, AlertTriangle, Minus, CircleDashed, Info } from 'lucide-react';
import { STATUS_LABEL, type NodeId, type NodeStatus, type NodeView } from '@/lib/investigation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { cn } from '@/lib/cn';

const ICONS: Record<NodeId, typeof Bot> = {
  proposal: Bot,
  tool: KeyRound,
  product: PackageSearch,
  spending: Wallet,
  vendor: Store,
  evidence: FileSearch,
  decision: Gavel,
  gateway: ShieldCheck,
};

const STATUS_STYLE: Record<NodeStatus, { ring: string; chip: string; icon: typeof Check }> = {
  pass: { ring: 'border-safe/50', chip: 'bg-safe/10 text-safe border-safe/30', icon: Check },
  warn: { ring: 'border-warn/55', chip: 'bg-warn/10 text-warn border-warn/30', icon: AlertTriangle },
  fail: { ring: 'border-danger/60', chip: 'bg-danger/10 text-danger border-danger/30', icon: X },
  info: { ring: 'border-accent/40', chip: 'bg-accent/10 text-accent-soft border-accent/25', icon: Info },
  not_evaluated: { ring: 'border-line-strong border-dashed', chip: 'bg-overlay text-faint border-line', icon: Minus },
  pending: { ring: 'border-line-strong border-dashed', chip: 'bg-overlay text-muted border-line', icon: CircleDashed },
};

interface StageData extends Record<string, unknown> {
  view: NodeView;
  index: number;
  hidden: boolean;
  active: boolean;
  selected: boolean;
}

type StageNode = Node<StageData, 'stage'>;

const StageNodeView = memo(function StageNodeView({ data }: NodeProps<StageNode>) {
  const { view, index, hidden, active, selected } = data;
  const Icon = ICONS[view.id];
  const st = STATUS_STYLE[view.status];
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of view.checks) counts[c.status === 'PASS' ? 'pass' : c.status === 'WARN' ? 'warn' : 'fail']++;
  return (
    <div
      className={cn(
        'w-[214px] rounded-xl border bg-surface px-3 py-2.5 text-left shadow-card transition-all duration-300',
        hidden ? 'border-dashed border-line opacity-45' : st.ring,
        active && 'shadow-glow',
        selected && 'ring-2 ring-accent/70 ring-offset-2 ring-offset-canvas',
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-line-strong !bg-raised" isConnectable={false} />
      <Handle type="target" id="top" position={Position.Top} className="!h-2 !w-2 !border-line-strong !bg-raised" isConnectable={false} />
      <div className="flex items-center gap-2">
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg border', hidden ? 'border-line bg-raised text-faint' : 'border-line bg-raised text-muted')}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-tight text-ink">
            <span className="font-mono text-2xs font-normal text-faint">{String(index + 1).padStart(2, '0')}</span>
            <span className="truncate">{view.title}</span>
          </p>
          <p className="truncate text-2xs text-faint">{view.subtitle}</p>
        </div>
      </div>
      {hidden ? (
        <p className="mt-2 text-2xs text-faint">Awaiting replay step…</p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-1.5">
            <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-2xs font-medium', st.chip)}>
              <st.icon className="h-3 w-3" aria-hidden />
              {STATUS_LABEL[view.status]}
            </span>
            {view.checks.length > 0 && (
              <span className="font-mono text-2xs text-faint">
                {counts.pass}✓ {counts.warn}! {counts.fail}✗
              </span>
            )}
            {view.flags.length > 0 && <span className="rounded bg-warn/15 px-1 text-2xs text-warn">{view.flags.length} flag{view.flags.length === 1 ? '' : 's'}</span>}
          </div>
          <p className="mt-1.5 line-clamp-2 text-2xs leading-snug text-muted" title={view.headline}>
            {view.headline}
          </p>
        </>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-line-strong !bg-raised" isConnectable={false} />
      <Handle type="source" id="bottom" position={Position.Bottom} className="!h-2 !w-2 !border-line-strong !bg-raised" isConnectable={false} />
    </div>
  );
});

const NODE_TYPES = { stage: StageNodeView };

const COL = 262;
const ROW = 178;

interface InvestigationGraphProps {
  nodes: NodeView[];
  /** Number of nodes revealed (replay). Defaults to all. */
  revealed?: number;
  selected: NodeId | null;
  onSelect: (id: NodeId) => void;
  className?: string;
}

export function InvestigationGraph({ nodes, revealed = nodes.length, selected, onSelect, className }: InvestigationGraphProps) {
  const c = useThemeColors();
  const flowNodes: StageNode[] = useMemo(
    () =>
      nodes.map((view, i) => ({
        id: view.id,
        type: 'stage',
        position: { x: (i % 4) * COL, y: Math.floor(i / 4) * ROW },
        data: { view, index: i, hidden: i >= revealed, active: i === revealed - 1 && revealed < nodes.length, selected: selected === view.id },
        draggable: false,
        connectable: false,
        selectable: true,
        ariaLabel: `${view.title}: ${i >= revealed ? 'not yet replayed' : STATUS_LABEL[view.status]}. ${view.headline}`,
      })),
    [nodes, revealed, selected],
  );

  const edges: Edge[] = useMemo(() => {
    const toneFor = (s: NodeStatus) => (s === 'fail' ? c.danger : s === 'warn' ? c.warn : s === 'pass' ? c.safe : c.faint);
    return nodes.slice(0, -1).map((from, i) => {
      const to = nodes[i + 1];
      const shown = i + 1 < revealed;
      const wrap = i === 3;
      const color = shown ? toneFor(from.status) : c.line;
      return {
        id: `${from.id}-${to.id}`,
        source: from.id,
        target: to.id,
        sourceHandle: wrap ? 'bottom' : undefined,
        targetHandle: wrap ? 'top' : undefined,
        type: wrap ? 'smoothstep' : 'default',
        animated: shown && i + 2 === revealed,
        style: { stroke: color, strokeWidth: shown ? 2 : 1.25, strokeDasharray: shown ? undefined : '4 4', transition: 'stroke 300ms' },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });
  }, [nodes, revealed, c]);

  return (
    <div className={cn('h-[420px] w-full overflow-hidden rounded-xl border border-line bg-canvas/60', className)} data-testid="investigation-graph">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, n) => onSelect(n.id as NodeId)}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.4}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        colorMode={typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? 'light' : 'dark'}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color={c.line} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
