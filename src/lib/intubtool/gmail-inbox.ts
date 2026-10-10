import type { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { getSettings } from "./settings";
import { imapClient, requireGmail } from "./mailer";

export type Label = { path: string; name: string; specialUse: string | null; messages: number; unseen: number; system: boolean };
export type MailRow = { uid: number; subject: string; from: string; fromEmail: string; date: string | null; seen: boolean; flagged: boolean; attachments: boolean };

const PER_PAGE = 50;
const ORDER = ["\\Inbox", "\\Flagged", "\\Important", "\\Sent", "\\Drafts", "\\All", "\\Junk", "\\Trash"];
const NAMES: Record<string, string> = { "\\Inbox": "Inbox", "\\Flagged": "Starred", "\\Important": "Important", "\\Sent": "Sent", "\\Drafts": "Drafts", "\\All": "All Mail", "\\Junk": "Spam", "\\Trash": "Trash" };

const iso = (d: unknown) => {
  const t = d ? new Date(d as string | Date) : null;
  return t && !isNaN(t.getTime()) ? t.toISOString() : null;
};

/** Read-only Gmail IMAP session: mailboxes are opened with EXAMINE so nothing is marked read or changed. */
async function withClient<T>(owner: string | null, fn: (c: ImapFlow) => Promise<T>) {
  const s = await getSettings(owner);
  requireGmail(s);
  const c = await imapClient(s);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.logout().catch(() => {});
  }
}

export function listLabels(owner: string | null): Promise<Label[]> {
  return withClient(owner, async (c) => {
    const boxes = await c.list({ statusQuery: { messages: true, unseen: true } });
    const out = boxes
      .filter((b) => !b.flags?.has("\\Noselect"))
      .map((b) => {
        const su = b.path.toUpperCase() === "INBOX" ? "\\Inbox" : b.specialUse || (b.flags?.has("\\Important") || b.path === "[Gmail]/Important" ? "\\Important" : null);
        return {
          path: b.path,
          name: (su && NAMES[su]) || b.path,
          specialUse: su,
          messages: b.status?.messages ?? 0,
          unseen: b.status?.unseen ?? 0,
          system: !!su || b.path.startsWith("[Gmail]"),
        };
      });
    const rank = (l: Label) => (l.specialUse ? ORDER.indexOf(l.specialUse) : -1);
    return out.sort((a, b) => {
      if (a.system !== b.system) return a.system ? -1 : 1;
      const ra = rank(a) < 0 ? 99 : rank(a);
      const rb = rank(b) < 0 ? 99 : rank(b);
      return ra - rb || a.name.localeCompare(b.name);
    });
  });
}

export function listMessages(owner: string | null, path: string, page = 1, q = ""): Promise<{ total: number; perPage: number; messages: MailRow[] }> {
  return withClient(owner, async (c) => {
    const lock = await c.getMailboxLock(path, { readOnly: true });
    try {
      const box = c.mailbox;
      const exists = box && typeof box !== "boolean" ? box.exists : 0;
      let range: string;
      let byUid = false;
      let total = exists;
      if (q) {
        const found = await c.search({ gmraw: q }, { uid: true });
        const uids = (Array.isArray(found) ? found : []).sort((a, b) => b - a);
        total = uids.length;
        const slice = uids.slice((page - 1) * PER_PAGE, page * PER_PAGE);
        if (!slice.length) return { total, perPage: PER_PAGE, messages: [] };
        range = slice.join(",");
        byUid = true;
      } else {
        const end = exists - (page - 1) * PER_PAGE;
        if (end < 1) return { total, perPage: PER_PAGE, messages: [] };
        range = `${Math.max(1, end - PER_PAGE + 1)}:${end}`;
      }
      const rows: MailRow[] = [];
      for await (const m of c.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true }, byUid ? { uid: true } : undefined)) {
        const f = m.envelope?.from?.[0];
        const bs = JSON.stringify(m.bodyStructure || {});
        rows.push({
          uid: m.uid,
          subject: m.envelope?.subject || "(no subject)",
          from: f?.name || f?.address || "",
          fromEmail: f?.address || "",
          date: iso(m.internalDate || m.envelope?.date),
          seen: m.flags?.has("\\Seen") ?? false,
          flagged: m.flags?.has("\\Flagged") ?? false,
          attachments: /"disposition":"attachment"/i.test(bs),
        });
      }
      rows.sort((a, b) => b.uid - a.uid);
      return { total, perPage: PER_PAGE, messages: rows };
    } finally {
      lock.release();
    }
  });
}

const addr = (a?: AddressObject | AddressObject[]) => (a ? (Array.isArray(a) ? a : [a]).map((x) => x.text).join(", ") : "");

export function getMessage(owner: string | null, path: string, uid: number) {
  return withClient(owner, async (c) => {
    const lock = await c.getMailboxLock(path, { readOnly: true });
    try {
      const m = await c.fetchOne(String(uid), { source: true }, { uid: true });
      if (!m || !m.source) return null;
      const p = await simpleParser(m.source);
      return {
        subject: p.subject || "(no subject)",
        from: addr(p.from),
        to: addr(p.to),
        cc: addr(p.cc),
        date: iso(p.date),
        html: typeof p.html === "string" ? p.html : null,
        text: p.text || "",
        attachments: p.attachments.map((a) => ({ filename: a.filename || "attachment", size: a.size, contentType: a.contentType })),
      };
    } finally {
      lock.release();
    }
  });
}
