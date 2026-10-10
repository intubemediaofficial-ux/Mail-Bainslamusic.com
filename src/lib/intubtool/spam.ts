const SPAM_WORDS = [
  "free", "guarantee", "guaranteed", "100%", "act now", "urgent", "limited time", "click here", "buy now", "cheap", "discount",
  "winner", "congratulations", "risk-free", "no obligation", "earn money", "make money", "cash", "million", "$$$", "!!!",
  "dear friend", "this is not spam", "unsubscribe now", "order now", "special promotion", "amazing", "incredible deal",
  "increase sales", "double your", "lowest price", "best price", "credit card", "no cost", "apply now", "call now", "offer expires",
];

export type SpamReport = { score: number; level: "low" | "medium" | "high"; issues: string[] };

/** How the mail is delivered — drives the Promotions-vs-Primary estimate. */
export type MailShape = {
  personal: boolean; // text-only, no pixel / List-Unsubscribe / footer
  pixel: boolean;
  unsubHeader: boolean;
  attachments: number;
  firstNameUsed: boolean;
};

/** Heuristic spam score 0-100 (lower is better). */
export function spamCheck(subject: string, bodyText: string, opts?: { personal?: boolean }): SpamReport {
  const issues: string[] = [];
  let score = 0;
  const all = `${subject}\n${bodyText}`;
  const lower = all.toLowerCase();

  const hits = SPAM_WORDS.filter((w) => lower.includes(w));
  if (hits.length) {
    score += Math.min(35, hits.length * 7);
    issues.push(`Spam-trigger words: ${hits.slice(0, 6).join(", ")}`);
  }
  const caps = (subject.match(/[A-Z]/g) || []).length;
  if (subject.length > 6 && caps / subject.length > 0.5) {
    score += 15;
    issues.push("Subject is mostly CAPITALS");
  }
  if (/[!?]{2,}/.test(all)) {
    score += 8;
    issues.push("Repeated punctuation (!! / ??)");
  }
  const links = (bodyText.match(/https?:\/\//g) || []).length;
  if (links > 3) {
    score += 12;
    issues.push(`Too many links (${links})`);
  }
  const words = bodyText.trim().split(/\s+/).filter(Boolean).length;
  if (words < 25) {
    score += 10;
    issues.push("Body is very short (<25 words)");
  }
  if (words > 300) {
    score += 6;
    issues.push("Body is long (>300 words) — keep cold emails short");
  }
  if (!opts?.personal && !/unsubscribe|opt[- ]?out|not interested|reply .*stop/i.test(bodyText)) {
    score += 8;
    issues.push("No opt-out / unsubscribe line");
  }
  if (/<img/i.test(bodyText)) {
    score += 5;
    issues.push("Images in a cold email lower deliverability");
  }
  if (subject.trim().length === 0) {
    score += 20;
    issues.push("Empty subject");
  } else if (subject.length > 70) {
    score += 5;
    issues.push("Subject longer than 70 chars");
  }
  if (/\{\{[^}]+\}\}/.test(all)) {
    score += 25;
    issues.push("Unrendered {{variables}} left in text");
  }
  score = Math.min(100, score);
  return { score, level: score < 25 ? "low" : score < 50 ? "medium" : "high", issues };
}

const PROMO_WORDS = [
  "offer", "offers", "deal", "sale", "discount", "promotion", "promo", "newsletter", "webinar", "exclusive", "limited", "launch",
  "pricing", "% off", "coupon", "bonus", "trial", "demo", "download", "register", "sign up", "upgrade",
  "boost", "grow your", "increase your", "services", "solutions", "our platform", "our product", "our company", "we help", "we offer",
];

export type Placement = "primary" | "promotions" | "spam";
export type MailHealth = {
  spam: SpamReport;
  placement: Placement;
  primary: number; // % estimates, sum = 100
  promotions: number;
  spamPct: number;
  reasons: string[]; // why Gmail would file it under Promotions/Spam
  tips: string[]; // what to change
};

/**
 * Estimates where Gmail will file the mail: Primary vs Promotions tab vs Spam.
 * Heuristic only — Gmail's classifier also weighs sender reputation and past replies, which we can't see.
 */
export function mailHealth(subject: string, bodyText: string, shape: MailShape): MailHealth {
  const spam = spamCheck(subject, bodyText, { personal: shape.personal });
  const reasons: string[] = [];
  const tips: string[] = [];
  let promo = 0;
  const lower = `${subject}\n${bodyText}`.toLowerCase();
  const words = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const links = (bodyText.match(/https?:\/\//g) || []).length;

  if (shape.pixel) {
    promo += 22;
    reasons.push("Open-tracking pixel (hidden image) — the strongest Promotions signal");
    tips.push("Turn on Personal mode or switch off “Track opens”");
  }
  if (shape.unsubHeader) {
    promo += 18;
    reasons.push("List-Unsubscribe header — Gmail treats it as bulk mail");
    if (!shape.pixel) tips.push("Personal mode drops the List-Unsubscribe header");
  }
  if (/unsubscribe|opt[- ]?out/i.test(bodyText) || /\/api\/intubtool\/u\//.test(bodyText)) {
    promo += 12;
    reasons.push("Unsubscribe link/line in the body");
    tips.push("In 1:1 mails say “just reply ‘no thanks’” instead of an unsubscribe link");
  }
  if (links > 1) {
    promo += Math.min(20, (links - 1) * 8);
    reasons.push(`${links} links — personal mails rarely have more than one`);
    tips.push("Keep at most one link (or none in the first email)");
  }
  const promoHits = PROMO_WORDS.filter((w) => lower.includes(w));
  if (promoHits.length) {
    promo += Math.min(24, promoHits.length * 6);
    reasons.push(`Marketing words: ${promoHits.slice(0, 5).join(", ")}`);
    tips.push("Write like a colleague: about them, not about your services");
  }
  if (words > 150) {
    promo += 10;
    reasons.push(`Long body (${words} words)`);
    tips.push("Aim for 50–120 words");
  }
  if (!shape.firstNameUsed) {
    promo += 10;
    reasons.push("No {{first_name}} greeting — reads like a broadcast");
    tips.push("Start with “Hi {{first_name}},”");
  }
  if (!/\?/.test(bodyText)) {
    promo += 6;
    reasons.push("No question — real 1:1 mails usually ask something");
    tips.push("End with one short question to invite a reply");
  }
  if ((bodyText.match(/!/g) || []).length > 1) {
    promo += 6;
    reasons.push("Several exclamation marks");
  }
  if (/<img|\.(png|jpe?g|gif)\b/i.test(bodyText)) {
    promo += 10;
    reasons.push("Images");
  }
  if (shape.attachments > 0) {
    promo += 5;
    reasons.push(`${shape.attachments} attachment${shape.attachments === 1 ? "" : "s"} in a first-contact mail`);
    tips.push("Send the deck in the follow-up, after they reply");
  }
  if (shape.personal && !shape.pixel && !shape.unsubHeader) reasons.unshift("Personal mode: plain text, no pixel, no bulk headers");

  const spamPct = Math.min(80, Math.round(spam.score * 0.7));
  // never claim more than ~90% Primary — reputation/history is unknown to us
  const promotions = Math.max(10, Math.min(100 - spamPct - 5, Math.round(promo * 0.75)));
  const primary = 100 - spamPct - promotions;
  const placement: Placement = spam.level === "high" || spamPct >= 40 ? "spam" : promotions > primary ? "promotions" : "primary";
  tips.push("New sender? Warm up: 20–30 mails/day for 2 weeks and reply to every answer — replies teach Gmail you're a person");
  return { spam, placement, primary, promotions, spamPct, reasons, tips: Array.from(new Set(tips)) };
}
