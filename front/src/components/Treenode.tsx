import { useState } from "react";
import type { TreeNodeType } from "../types";

export function TreeNode({ node, depth }: { node: TreeNodeType; depth: number }) {
  const [collapsed, setCollapsed] = useState(false);

  if (node.is_terminal) {
    return (
      <div style={{ paddingLeft: depth * 20 }} className="flex items-center gap-2 py-0.5">
        <span className="text-zinc-600 text-xs">└─</span>
        <span className="text-yellow-400 text-xs">{node.symbol}</span>
        {node.matched_token && (
          <span className="text-zinc-500 text-xs">«{node.matched_token}»</span>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        style={{ paddingLeft: depth * 20 }}
        className="flex items-center gap-2 py-0.5 cursor-pointer group"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-zinc-600 text-xs">{collapsed ? "▶" : "▼"}</span>
        <span className="text-cyan-400 text-xs font-bold group-hover:text-cyan-300">
          {node.symbol}
        </span>
      </div>
      {!collapsed &&
        node.children?.map((child, i) => (
          <TreeNode key={i} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}