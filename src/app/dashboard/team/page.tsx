"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import TeamTreeView from "./TeamTreeView";
import TeamListView from "./TeamListView";

export default function TeamPage() {
  const { t } = useLanguage();
  const [view, setView] = useState<"tree" | "list">("tree");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" data-testid="team-title">
          {t("team.title")}
        </h1>
        <div className="flex rounded-md border border-gray-300 overflow-hidden" data-testid="team-view-toggle">
          <button
            onClick={() => setView("tree")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "tree"
                ? "bg-primary text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            data-testid="toggle-tree-view"
          >
            {t("team.treeView")}
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-primary text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
            data-testid="toggle-list-view"
          >
            {t("team.listView")}
          </button>
        </div>
      </div>

      {view === "tree" ? <TeamTreeView /> : <TeamListView />}
    </div>
  );
}
