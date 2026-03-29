import TreeView from "./TreeView";

export default function TreePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" data-testid="tree-title">
        Network Tree
      </h1>
      <TreeView />
    </div>
  );
}
