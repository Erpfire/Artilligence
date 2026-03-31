"use client";

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { formatINR, type TranslationKey } from "@/lib/i18n";

interface TreeNode {
  id: string;
  name: string;
  email: string;
  status: string;
  depth: number;
  referralCode: string;
  totalDownline: number;
  totalSales: string;
  salesCount: number;
  hasChildren?: boolean;
  children: (TreeNode | null)[];
}

function TreeNodeCard({
  node,
  onDrillDown,
  t,
}: {
  node: TreeNode | null;
  onDrillDown: (id: string) => void;
  t: (key: TranslationKey) => string;
}) {
  if (!node) {
    return (
      <div
        className="flex h-24 w-44 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400"
        data-testid="empty-slot"
      >
        {t("team.emptySlot")}
      </div>
    );
  }

  const isBlocked = node.status === "BLOCKED";
  const isActive = node.status === "ACTIVE";

  return (
    <div
      className={`flex h-24 w-44 flex-col items-center justify-center rounded-lg border-2 shadow-sm transition-colors cursor-pointer ${
        isBlocked
          ? "border-gray-300 bg-gray-200 text-gray-500"
          : isActive
          ? "border-green-300 bg-green-50 hover:border-green-500"
          : "border-gray-300 bg-gray-100"
      }`}
      data-testid={`tree-node-${node.id}`}
      data-status={node.status}
      onClick={() => {
        if (node.children?.some(Boolean) || node.hasChildren) {
          onDrillDown(node.id);
        }
      }}
    >
      <span
        className={`text-sm font-medium truncate max-w-[160px] ${
          isBlocked ? "text-gray-500" : "text-gray-900"
        }`}
        data-testid={`tree-node-name-${node.id}`}
      >
        {node.name}
      </span>
      <span className="text-[11px] text-gray-500 mt-0.5" data-testid={`tree-node-downline-${node.id}`}>
        {node.totalDownline} {t("team.downline")}
      </span>
      <span className="text-[11px] text-gray-500" data-testid={`tree-node-sales-${node.id}`}>
        {formatINR(node.totalSales)}
      </span>
      {(node.children?.some(Boolean) || node.hasChildren) && (
        <span className="text-[10px] text-primary mt-0.5">
          {t("team.viewSubtree")}
        </span>
      )}
    </div>
  );
}

function TreeLevel({
  nodes,
  onDrillDown,
  t,
}: {
  nodes: (TreeNode | null)[];
  onDrillDown: (id: string) => void;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {nodes.map((node, i) => (
        <TreeNodeCard
          key={node?.id || `empty-${i}`}
          node={node}
          onDrillDown={onDrillDown}
          t={t}
        />
      ))}
    </div>
  );
}

export default function TeamTreeView() {
  const { t } = useLanguage();
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [rootId, setRootId] = useState("");
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);

  const fetchTree = useCallback(async (id?: string) => {
    setLoading(true);
    try {
      const url = id
        ? `/api/dashboard/team?rootId=${id}&depth=3`
        : "/api/dashboard/team?depth=3";
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

  function drillDown(id: string) {
    const nodeName = findNodeName(tree, id) || "Member";
    if (!rootId) {
      setBreadcrumbs([{ id: tree?.id || "", name: tree?.name || "Root" }]);
    }
    setBreadcrumbs((prev) => [...prev, { id, name: nodeName }]);
    setRootId(id);
    fetchTree(id);
  }

  function goToBreadcrumb(id: string, index: number) {
    if (index === -1) {
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

  function getLevels(root: TreeNode | null): (TreeNode | null)[][] {
    if (!root) return [];
    const levels: (TreeNode | null)[][] = [[root]];
    let currentLevel: (TreeNode | null)[] = [root];

    for (let d = 0; d < 3; d++) {
      const nextLevel: (TreeNode | null)[] = [];
      let hasAnyChild = false;
      for (const node of currentLevel) {
        if (node && node.children && node.children.length > 0) {
          nextLevel.push(...node.children);
          hasAnyChild = true;
        } else if (node) {
          nextLevel.push(null, null, null);
          hasAnyChild = true;
        } else {
          nextLevel.push(null, null, null);
        }
      }
      if (hasAnyChild) {
        levels.push(nextLevel);
        currentLevel = nextLevel;
      } else {
        break;
      }
    }

    return levels;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="team-tree-loading">
        <p className="text-gray-500">{t("common.loading")}</p>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="py-12 text-center" data-testid="team-tree-empty">
        <p className="text-gray-500">{t("team.noMembers")}</p>
      </div>
    );
  }

  const levels = getLevels(tree);

  return (
    <div>
      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <div className="mb-4 flex items-center gap-1 text-sm flex-wrap" data-testid="team-breadcrumbs">
          <button
            onClick={() => goToBreadcrumb("", -1)}
            className="text-primary hover:underline"
            data-testid="breadcrumb-me"
          >
            {t("team.me")}
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
      <div className="space-y-6 overflow-x-auto pb-4" data-testid="team-tree-container">
        {levels.map((level, i) => (
          <div key={i}>
            <TreeLevel nodes={level} onDrillDown={drillDown} t={t} />
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
