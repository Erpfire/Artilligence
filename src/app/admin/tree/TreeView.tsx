"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

interface TreeNode {
  id: string;
  name: string;
  email: string;
  status: string;
  depth: number;
  referralCode: string;
  hasChildren?: boolean;
  children: (TreeNode | null)[];
}

interface SearchResult {
  id: string;
  name: string;
  email: string;
  status: string;
}

function TreeNodeCard({
  node,
  onDrillDown,
}: {
  node: TreeNode | null;
  onDrillDown: (id: string) => void;
}) {
  if (!node) {
    return (
      <div
        className="flex h-20 w-40 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400"
        data-testid="empty-slot"
      >
        Empty Slot
      </div>
    );
  }

  const isBlocked = node.status === "BLOCKED";

  return (
    <div
      className={`flex h-20 w-40 flex-col items-center justify-center rounded-lg border-2 shadow-sm transition-colors ${
        isBlocked
          ? "border-gray-300 bg-gray-200 text-gray-500"
          : "border-primary/30 bg-white hover:border-primary"
      }`}
      data-testid={`tree-node-${node.id}`}
    >
      <Link
        href={`/admin/members/${node.id}`}
        className={`text-sm font-medium truncate max-w-[140px] ${
          isBlocked ? "text-gray-500" : "text-gray-900 hover:text-primary"
        }`}
        data-testid={`tree-node-name-${node.id}`}
      >
        {node.name}
      </Link>
      <span className="text-xs text-gray-400 truncate max-w-[140px]">{node.email}</span>
      {isBlocked && (
        <span className="text-[10px] font-medium text-red-400 mt-0.5" data-testid={`tree-node-blocked-${node.id}`}>
          BLOCKED
        </span>
      )}
      {(node.children?.some(Boolean) || node.hasChildren) && (
        <button
          onClick={(e) => {
            e.preventDefault();
            onDrillDown(node.id);
          }}
          className="mt-0.5 text-[10px] text-primary hover:underline"
          data-testid={`drill-down-${node.id}`}
        >
          View subtree
        </button>
      )}
    </div>
  );
}

function TreeSearch({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        setResults(data.members || []);
        setShowDropdown(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function selectMember(member: SearchResult) {
    setQuery(member.name);
    setShowDropdown(false);
    onSelect(member.id, member.name);
  }

  return (
    <div className="relative" data-testid="tree-search">
      <input
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder="Search member by name, email, or phone..."
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary sm:max-w-sm"
        data-testid="tree-search-input"
      />
      {searching && (
        <span className="absolute right-3 top-2.5 text-xs text-gray-400">Searching...</span>
      )}
      {showDropdown && results.length > 0 && (
        <div
          className="absolute z-10 mt-1 w-full max-w-sm rounded-md border bg-white shadow-lg"
          data-testid="tree-search-results"
        >
          {results.map((m) => (
            <button
              key={m.id}
              onMouseDown={() => selectMember(m)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b last:border-0"
              data-testid={`tree-search-result-${m.id}`}
            >
              <span className="font-medium">{m.name}</span>
              <span className="text-gray-400 ml-2">{m.email}</span>
            </button>
          ))}
        </div>
      )}
      {showDropdown && !searching && results.length === 0 && query.length >= 2 && (
        <div
          className="absolute z-10 mt-1 w-full max-w-sm rounded-md border bg-white p-3 text-sm text-gray-500 shadow-lg"
          data-testid="tree-search-no-results"
        >
          No members found
        </div>
      )}
    </div>
  );
}

function TreeLevel({
  nodes,
  onDrillDown,
}: {
  nodes: (TreeNode | null)[];
  onDrillDown: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {nodes.map((node, i) => (
        <TreeNodeCard key={node?.id || `empty-${i}`} node={node} onDrillDown={onDrillDown} />
      ))}
    </div>
  );
}

export default function TreeView() {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [rootId, setRootId] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);

  const fetchTree = useCallback(async (id?: string) => {
    setLoading(true);
    try {
      const url = id ? `/api/admin/tree?rootId=${id}&depth=3` : "/api/admin/tree?depth=3";
      const res = await fetch(url);
      const data = await res.json();
      setTree(data.tree);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  function handleSearchSelect(memberId: string, memberName: string) {
    setBreadcrumbs([{ id: memberId, name: memberName }]);
    setRootId(memberId);
    fetchTree(memberId);
  }

  function drillDown(id: string) {
    // Find the node name for breadcrumbs
    const nodeName = findNodeName(tree, id) || "Member";
    if (!rootId) {
      // First drill down from root
      setBreadcrumbs([{ id: tree?.id || "", name: tree?.name || "Root" }]);
    }
    setBreadcrumbs((prev) => [...prev, { id, name: nodeName }]);
    setRootId(id);
    fetchTree(id);
  }

  function goToBreadcrumb(id: string, index: number) {
    if (index === -1) {
      // Go to root
      setRootId("");
      setBreadcrumbs([]);
      fetchTree();
    } else {
      setRootId(id);
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
      fetchTree(id);
    }
  }

  function findNodeName(node: TreeNode | null, id: string): string | null {
    if (!node) return null;
    if (node.id === id) return node.name;
    for (const child of node.children) {
      const found = findNodeName(child, id);
      if (found) return found;
    }
    return null;
  }

  // Flatten tree into levels for display
  function getLevels(root: TreeNode | null): (TreeNode | null)[][] {
    if (!root) return [];
    const levels: (TreeNode | null)[][] = [[root]];
    let currentLevel = [root];

    for (let d = 0; d < 3; d++) {
      const nextLevel: (TreeNode | null)[] = [];
      let hasAnyChild = false;
      for (const node of currentLevel) {
        if (node && node.children && node.children.length > 0) {
          nextLevel.push(...node.children);
          hasAnyChild = true;
        } else if (node) {
          nextLevel.push(null, null, null);
          hasAnyChild = true; // Show empty slots for nodes that exist
        } else {
          nextLevel.push(null, null, null);
        }
      }
      if (hasAnyChild) {
        levels.push(nextLevel);
        currentLevel = nextLevel.filter(Boolean) as TreeNode[];
      } else {
        break;
      }
    }

    return levels;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="tree-loading">
        <p className="text-gray-500">Loading tree...</p>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="py-12 text-center" data-testid="tree-empty">
        <p className="text-gray-500">No members in the network tree yet.</p>
      </div>
    );
  }

  const levels = getLevels(tree);

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <TreeSearch onSelect={handleSearchSelect} />
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="mb-4 flex items-center gap-1 text-sm" data-testid="tree-breadcrumbs">
          <button
            onClick={() => goToBreadcrumb("", -1)}
            className="text-primary hover:underline"
            data-testid="breadcrumb-root"
          >
            Root
          </button>
          {breadcrumbs.map((bc, i) => (
            <span key={bc.id} className="flex items-center gap-1">
              <span className="text-gray-400">/</span>
              <button
                onClick={() => goToBreadcrumb(bc.id, i)}
                className={`${
                  i === breadcrumbs.length - 1
                    ? "text-gray-700 font-medium"
                    : "text-primary hover:underline"
                }`}
                data-testid={`breadcrumb-${bc.id}`}
              >
                {bc.name}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Tree visualization */}
      <div className="space-y-6 overflow-x-auto pb-4" data-testid="tree-container">
        {levels.map((level, i) => (
          <div key={i}>
            <TreeLevel nodes={level} onDrillDown={drillDown} />
            {i < levels.length - 1 && (
              <div className="flex justify-center my-2">
                <div className="h-4 w-px bg-gray-300" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
