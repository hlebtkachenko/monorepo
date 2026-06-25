import { Badge } from "@workspace/ui/components/badge"

import { JsonViewer } from "./json-viewer"

export interface TraceNode {
  id: string
  label: string
  kind: "tool" | "model" | "guard" | "other"
  durationMs?: number
  payload?: unknown
  children?: TraceNode[]
}

function KindBadge({ kind }: { kind: TraceNode["kind"] }) {
  const variant =
    kind === "tool"
      ? "default"
      : kind === "model"
        ? "secondary"
        : kind === "guard"
          ? "destructive"
          : "outline"
  return <Badge variant={variant}>{kind}</Badge>
}

function Node({ node, depth }: { node: TraceNode; depth: number }) {
  return (
    <details
      open={depth < 1}
      className="border-l border-border"
      style={{ marginLeft: depth === 0 ? 0 : 12 }}
    >
      <summary className="flex cursor-pointer items-center gap-2 py-1 pl-2 text-sm">
        <KindBadge kind={node.kind} />
        <span className="font-medium">{node.label}</span>
        {typeof node.durationMs === "number" ? (
          <span className="text-xs text-muted-foreground">
            {node.durationMs}ms
          </span>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          #{node.id.slice(0, 8)}
        </span>
      </summary>
      <div className="pl-4">
        {node.payload !== undefined ? (
          <div className="my-2">
            <JsonViewer
              value={node.payload}
              collapsedDepth={1}
              title="payload"
            />
          </div>
        ) : null}
        {(node.children ?? []).map((child) => (
          <Node key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>
    </details>
  )
}

export function TraceTreePlaceholder({ root }: { root: TraceNode }) {
  return (
    <div className="rounded-md border border-border p-2">
      <Node node={root} depth={0} />
    </div>
  )
}
