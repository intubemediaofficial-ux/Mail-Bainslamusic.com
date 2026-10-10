import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "fs";
import path from "path";

export type LinkedInPerson = {
  fullName: string;
  title?: string;
  location?: string;
  linkedinUrl?: string;
  keyword: string;
};

export type LinkedInOptions = {
  liAt: string;
  minDelayMs: number;
  maxDelayMs: number;
  log: (line: string) => void;
  shouldStop?: () => boolean;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export class LinkedInAuthError extends Error {}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => Math.floor(min + Math.random() * Math.max(0, max - min));

export function normalizeLinkedinUrl(url?: string | null) {
  if (!url) return undefined;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const m = u.pathname.match(/\/in\/([^/]+)/i);
    if (!m) return undefined;
    return `https://www.linkedin.com/in/${decodeURIComponent(m[1]).replace(/\/$/, "")}`;
  } catch {
    return undefined;
  }
}

export function debugDir() {
  const dir = path.join(process.cwd(), "uploads", "intubtool-debug");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export class LinkedInSession {
  private browser?: Browser;
  private ctx?: BrowserContext;
  private page?: Page;
  pagesVisited = 0;

  constructor(private opts: LinkedInOptions) {}

  private async delay() {
    await sleep(rand(this.opts.minDelayMs, this.opts.maxDelayMs));
  }

  async open() {
    this.browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-blink-features=AutomationControlled"],
    });
    this.ctx = await this.browser.newContext({ userAgent: UA, locale: "en-US", viewport: { width: 1366, height: 860 } });
    await this.ctx.addCookies([
      { name: "li_at", value: this.opts.liAt, domain: ".linkedin.com", path: "/", httpOnly: true, secure: true, sameSite: "None" },
    ]);
    this.page = await this.ctx.newPage();
    // block heavy assets to save memory/bandwidth on a small VPS
    await this.page.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "media" || t === "font") return route.abort();
      return route.continue();
    });
    await this.goto("https://www.linkedin.com/feed/");
    if (await this.isLoggedOut()) throw new LinkedInAuthError("LinkedIn session invalid — li_at cookie expired or wrong. Update it in Settings.");
    this.opts.log("LinkedIn session OK");
  }

  private async goto(url: string) {
    if (!this.page) throw new Error("session not open");
    this.pagesVisited++;
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await this.page.waitForTimeout(rand(1500, 3000));
  }

  private async isLoggedOut() {
    const url = this.page!.url();
    if (/\/(login|authwall|checkpoint|uas\/login)/i.test(url)) return true;
    return (await this.page!.$('form.login__form, input#username, a[href*="/login"]')) !== null && !(await this.page!.$('#global-nav'));
  }

  async screenshot(name: string) {
    try {
      const file = path.join(debugDir(), `${Date.now()}-${name.replace(/[^a-z0-9_-]+/gi, "_")}.png`);
      await this.page?.screenshot({ path: file, fullPage: false });
      return file;
    } catch {
      return undefined;
    }
  }

  /** Resolve a company name (or LinkedIn company URL) to its /company/<slug>/ URL. */
  async findCompany(nameOrUrl: string): Promise<{ url: string; name: string } | null> {
    const direct = nameOrUrl.match(/linkedin\.com\/(company|school|showcase)\/([^/?#]+)/i);
    if (direct) return { url: `https://www.linkedin.com/${direct[1]}/${direct[2]}/`, name: nameOrUrl };

    await this.goto(`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(nameOrUrl)}`);
    if (await this.isLoggedOut()) throw new LinkedInAuthError("LinkedIn logged out during search");
    try {
      await this.page!.waitForSelector('a[href*="/company/"]', { timeout: 15000 });
    } catch {
      await this.screenshot(`company-notfound-${nameOrUrl}`);
      return null;
    }
    const results = await this.page!.$$eval('a[href*="/company/"]', (as) =>
      as
        .map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent || "").trim() }))
        .filter((x) => x.text && /\/company\/[^/]+\/?/.test(x.href))
    );
    if (!results.length) return null;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const want = norm(nameOrUrl);
    const best =
      results.find((r) => norm(r.text) === want) ||
      results.find((r) => norm(r.text).includes(want) || want.includes(norm(r.text))) ||
      results[0];
    const m = best.href.match(/linkedin\.com\/company\/([^/?#]+)/i);
    if (!m) return null;
    return { url: `https://www.linkedin.com/company/${m[1]}/`, name: best.text.split("\n")[0].trim() || nameOrUrl };
  }

  /** People tab of a company filtered by keyword; scrolls to load up to `max` cards. */
  async companyPeople(companyUrl: string, keyword: string, max: number): Promise<LinkedInPerson[]> {
    const url = `${companyUrl.replace(/\/$/, "")}/people/?keywords=${encodeURIComponent(keyword)}`;
    await this.goto(url);
    if (await this.isLoggedOut()) throw new LinkedInAuthError("LinkedIn logged out while loading people page");
    await this.page!.waitForSelector('a[href*="/in/"], .org-people__no-results, .artdeco-empty-state', { timeout: 20000 }).catch(() => undefined);

    let lastCount = -1;
    for (let round = 0; round < 12; round++) {
      const count = await this.page!.$$eval('a[href*="/in/"]', (as) => new Set(as.map((a) => (a as HTMLAnchorElement).href.split("?")[0])).size);
      if (count >= max || count === lastCount || this.opts.shouldStop?.()) break;
      lastCount = count;
      await this.page!.mouse.wheel(0, rand(1200, 2200));
      await this.page!.waitForTimeout(rand(1200, 2500));
      const more = await this.page!.$('button.scaffold-finite-scroll__load-button, button:has-text("Show more results")');
      if (more) {
        await more.click().catch(() => undefined);
        await this.page!.waitForTimeout(rand(1500, 3000));
      }
    }

    const people = await this.page!.evaluate(() => {
      const out: { fullName: string; title?: string; location?: string; linkedinUrl?: string }[] = [];
      const seen = new Set<string>();
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'));
      for (const a of anchors) {
        const href = a.href.split("?")[0];
        if (seen.has(href)) continue;
        // walk up to the card container
        let card: HTMLElement | null = a;
        for (let i = 0; i < 6 && card; i++) {
          if (card.tagName === "LI" || card.classList.contains("org-people-profile-card") || card.classList.contains("artdeco-card")) break;
          card = card.parentElement;
        }
        if (!card) continue;
        const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();
        const titleEl = card.querySelector(".artdeco-entity-lockup__title, .org-people-profile-card__profile-title, [class*='lockup__title']");
        const subEl = card.querySelector(".artdeco-entity-lockup__subtitle, [class*='lockup__subtitle'], .lt-line-clamp");
        let name = clean(titleEl?.textContent) || clean(a.textContent);
        name = name.replace(/\bLinkedIn Member\b/i, "").trim();
        if (!name || /^view\b/i.test(name)) continue;
        const title = clean(subEl?.textContent) || undefined;
        seen.add(href);
        out.push({ fullName: name, title, linkedinUrl: href });
      }
      return out;
    });

    if (!people.length) await this.screenshot(`people-empty-${keyword}`);
    await this.delay();
    return people.slice(0, max).map((p) => ({ ...p, linkedinUrl: normalizeLinkedinUrl(p.linkedinUrl), keyword }));
  }

  async close() {
    await this.ctx?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
  }
}
