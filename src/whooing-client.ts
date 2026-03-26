import crypto from "node:crypto";

export interface WhooingConfig {
  appId: string;
  token: string;
  signature: string;
  defaultSectionId: string;
}

export interface AccountInfo {
  name: string;
  type: string; // assets, liabilities, capital, income, expenses
}

export class WhooingClient {
  private config: WhooingConfig;
  private accountCache: Map<string, AccountInfo> = new Map();

  constructor(config: WhooingConfig) {
    this.config = config;
  }

  get defaultSectionId(): string {
    return this.config.defaultSectionId;
  }

  private getApiKey(): string {
    const nounce = crypto.randomBytes(20).toString("hex");
    const timestamp = Math.floor(Date.now() / 1000);
    return `app_id=${this.config.appId},token=${this.config.token},signiture=${this.config.signature},nounce=${nounce},timestamp=${timestamp}`;
  }

  async apiGet(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<unknown> {
    const qs = new URLSearchParams(params).toString();
    const url = qs
      ? `https://whooing.com/api/${endpoint}?${qs}`
      : `https://whooing.com/api/${endpoint}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": this.getApiKey(),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Whooing API error ${res.status}: ${text}`);
    }

    const json = (await res.json()) as { code: number; message: string; results: unknown };
    if (json.code !== 200) {
      throw new Error(`Whooing API error ${json.code}: ${json.message}`);
    }

    return json.results;
  }

  async loadAccounts(sectionId?: string): Promise<Map<string, AccountInfo>> {
    const sid = sectionId || this.config.defaultSectionId;
    const results = (await this.apiGet("accounts.json", {
      section_id: sid,
    })) as Record<string, Array<{ account_id: string; title: string; type: string }>>;

    const cache = new Map<string, AccountInfo>();
    for (const [type, accounts] of Object.entries(results)) {
      if (!Array.isArray(accounts)) continue;
      for (const acc of accounts) {
        cache.set(acc.account_id, { name: acc.title, type });
      }
    }

    // Merge into main cache
    for (const [id, info] of cache) {
      this.accountCache.set(id, info);
    }

    return cache;
  }

  getAccountName(accountId: string): string {
    return this.accountCache.get(accountId)?.name ?? accountId;
  }

  getAccountInfo(accountId: string): AccountInfo | undefined {
    return this.accountCache.get(accountId);
  }

  getAccountCache(): Map<string, AccountInfo> {
    return this.accountCache;
  }
}
