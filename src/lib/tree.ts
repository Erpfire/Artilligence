// BFS tree placement and traversal

import { store } from "./store";

const MAX_CHILDREN = 3;

export async function findPlacementPosition(sponsorId: string) {
  await store.acquireLock();
  try {
    const sponsor = store.members.get(sponsorId);
    if (!sponsor) throw new Error("Sponsor not found");

    const queue = [sponsor];

    while (queue.length > 0) {
      const node = queue.shift()!;
      const children = store.getChildrenOf(node.id);

      if (children.length < MAX_CHILDREN) {
        const position = children.length + 1;
        const depth = node.depth + 1;
        const placeholderId = `ph-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const path = `${node.path}/${placeholderId}`;

        // Reserve position with a placeholder member
        store.members.set(placeholderId, {
          id: placeholderId,
          parentId: node.id,
          position,
          depth,
          path,
          status: "ACTIVE",
          name: "__placeholder__",
          email: "",
          phone: "",
          role: "MEMBER",
          sponsorId: null,
          referralCode: "",
          preferredLanguage: "en",
          hasCompletedOnboarding: false,
          registrationIp: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return { parentId: node.id, position, depth, path };
      }

      children.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
      queue.push(...children);
    }

    throw new Error("No available position found");
  } finally {
    store.releaseLock();
  }
}

export async function getUpline(memberId: string, maxLevels?: number) {
  const member = store.members.get(memberId);
  if (!member) return [];

  const ancestors: any[] = [];
  let current = member;

  while (current.parentId) {
    if (maxLevels !== undefined && ancestors.length >= maxLevels) break;
    const parent = store.members.get(current.parentId);
    if (!parent) break;
    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}

export async function getDownline(memberId: string, maxDepth?: number) {
  const member = store.members.get(memberId);
  if (!member) return [];

  const descendants: any[] = [];
  const queue: Array<{ node: any; level: number }> = [{ node: member, level: 0 }];

  while (queue.length > 0) {
    const { node, level } = queue.shift()!;
    const children = store.getChildrenOf(node.id);
    children.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

    for (const child of children) {
      const childLevel = level + 1;
      if (maxDepth !== undefined && childLevel > maxDepth) continue;
      descendants.push({ ...child, level: childLevel });
      queue.push({ node: child, level: childLevel });
    }
  }

  return descendants;
}

export async function countChildren(memberId: string): Promise<number> {
  return store.getChildrenOf(memberId).length;
}
