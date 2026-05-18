import { useState } from "react";

export interface TreeNodeType {
  symbol: string;
  is_terminal: boolean;
  matched_token?: string;
  children?: TreeNodeType[];
}

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
}

export function TreeNode({ node, depth }: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(false);

  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  // 1. Renderizado para Nodos Hoja (Terminales)
  if (node.is_terminal) {
    return (
      <div style={{ paddingLeft: depth * 16 }} className="flex items-center gap-1.5 py-0.5 font-mono">
        <span className="text-zinc-700 text-xs select-none">└─</span>
        <span className="text-yellow-400 text-xs font-semibold">{node.symbol}</span>
        {node.matched_token && (
          <span className="text-zinc-500 text-[11px] bg-zinc-900/50 px-1 border border-zinc-800 rounded">
            "{node.matched_token}"
          </span>
        )}
      </div>
    );
  }

  // 2. Renderizado para Nodos Rama (No Terminales)
  return (
    <div className="font-mono">
      <div 
        style={{ paddingLeft: depth * 16 }}
        className={`flex items-center gap-1.5 py-0.5 group ${hasChildren ? 'cursor-pointer' : ''}`}
        onClick={() => hasChildren && setCollapsed(!collapsed)}
      >
        {/* Solo muestra la flecha si el nodo de verdad tiene derivaciones hijas */}
        {hasChildren ? (
          <span className="text-zinc-500 text-[10px] w-3 text-center select-none transition-transform duration-100">
            {collapsed ? "▶" : "▼"}
          </span>
        ) : (
          <span className="text-zinc-700 text-xs w-3 text-center select-none">└─</span>
        )}
        
        <span className="text-cyan-400 text-xs font-bold group-hover:text-cyan-300">
          {node.symbol}
        </span>
        
        {/* Pequeño indicador si la producción está colapsada con hijos ocultos */}
        {collapsed && hasChildren && (
          <span className="text-[10px] text-zinc-600 bg-zinc-900 px-1 rounded border border-zinc-850">
            {node.children?.length} nodos
          </span>
        )}
      </div>

      {/* Renderizado recursivo de los hijos */}
      {!collapsed && hasChildren && (
        <div className="relative">
          {/* Línea vertical sutil que conecta visualmente el bloque del padre con sus hijos */}
          {depth > 0 && (
            <div 
              className="absolute left-0 top-0 bottom-2 border-l border-zinc-800/40 pointer-events-none" 
              style={{ marginLeft: (depth * 16) + 5 }}
            />
          )}
          {node.children!.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}