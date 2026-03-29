// In-memory store for unit tests — bridges factory-created data to implementation functions

export class InMemoryStore {
  members = new Map<string, any>();
  sales = new Map<string, any>();
  walletsByUserId = new Map<string, any>();
  commissions: any[] = [];
  commissionSettingsArray: any[] | null = null;
  walletTransactions: any[] = [];
  notifications: any[] = [];
  appSettings = new Map<string, any>();

  // Mutex for concurrent tree placement
  private _lockQueue: Array<() => void> = [];
  private _locked = false;

  clear() {
    this.members.clear();
    this.sales.clear();
    this.walletsByUserId.clear();
    this.commissions = [];
    this.commissionSettingsArray = null;
    this.walletTransactions = [];
    this.notifications = [];
    this.appSettings.clear();
    this._lockQueue = [];
    this._locked = false;
  }

  async acquireLock(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this._lockQueue.push(resolve);
    });
  }

  releaseLock(): void {
    if (this._lockQueue.length > 0) {
      const next = this._lockQueue.shift()!;
      next();
    } else {
      this._locked = false;
    }
  }

  getChildrenOf(parentId: string): any[] {
    return Array.from(this.members.values()).filter(
      (m: any) => m.parentId === parentId
    );
  }
}

export const store = new InMemoryStore();
