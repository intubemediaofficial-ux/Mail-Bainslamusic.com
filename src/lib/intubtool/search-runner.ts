import { prisma } from "@/lib/db";
import { getSettings, type ToolSettings } from "./settings";
import { LinkedInAuthError, LinkedInSession } from "./linkedin";
import { matchCategory, upsertLead } from "./leads";
import { scopeForOwner } from "./scope";
import { SalesqlError } from "./salesql";
import { resolveLookup, resolveOrganizations, searchAllPeople, type ProspectPerson, type SearchPeopleParams } from "./salesql-mcp";

export type JobFilters = { countries?: string[]; regions?: string[]; industries?: string[]; hasEmail?: boolean; hasPhone?: boolean; strictTitle?: boolean };

const TITLE_STOPWORDS = new Set(["of", "the", "and", "for", "at", "in", "to", "a", "an", "&"]);
/** True when the person's current title/headline contains one whole keyword, or every meaningful word of one keyword. */
export function titleMatches(text: string, keywords: string[]) {
  const t = text.toLowerCase();
  return keywords.some((k) => {
    const kk = k.toLowerCase().trim();
    if (!kk) return false;
    if (t.includes(kk)) return true;
    const words = kk.split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !TITLE_STOPWORDS.has(w));
    return words.length > 0 && words.every((w) => t.includes(w));
  });
}

export const parseFilters = (s: string | null): JobFilters => {
  try {
    const f = s ? (JSON.parse(s) as JobFilters) : {};
    return f && typeof f === "object" ? f : {};
  } catch {
    return {};
  }
};

type Job = NonNullable<Awaited<ReturnType<typeof prisma.searchJob.findUnique>>> & { _own: { ownerId: string | null; matchOwners: (string | null)[] | null } };

const parseList = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

async function appendLog(jobId: string, line: string) {
  const stamp = new Date().toISOString().slice(11, 19);
  const job = await prisma.searchJob.findUnique({ where: { id: jobId }, select: { log: true } });
  const log = `${job?.log ?? ""}[${stamp}] ${line}\n`.slice(-20000);
  await prisma.searchJob.update({ where: { id: jobId }, data: { log } });
}

async function isCancelled(jobId: string) {
  const j = await prisma.searchJob.findUnique({ where: { id: jobId }, select: { status: true } });
  return !j || j.status === "cancelled";
}

async function failJob(jobId: string, error: string) {
  await prisma.searchJob.update({ where: { id: jobId }, data: { status: "failed", error, finishedAt: new Date() } });
}

export async function runSearchJob(jobId: string) {
  const row = await prisma.searchJob.findUnique({ where: { id: jobId } });
  if (!row || row.status !== "queued") return;
  // leads created by the job belong to the job's owner and only merge into leads that owner can see
  const scope = await scopeForOwner(row.ownerId);
  const job: Job = { ...row, _own: { ownerId: scope.owner, matchOwners: scope.readOwners } };

  const companies = parseList(job.companies);
  const keywords = parseList(job.keywords);
  const settings = await getSettings();

  if (job.mode === "title") return runTitleJob(job, keywords, settings);
  if (job.source === "salesql") return runSalesqlJob(job, companies, keywords, settings);
  return runLinkedinJob(job, companies, keywords, settings);
}

const locationText = (p: ProspectPerson) => [p.location?.city, p.location?.state, p.location?.country].filter(Boolean).join(", ") || null;

const availabilityNote = (p: ProspectPerson, searchedOrgUuids: string[]) => {
  const domains = Array.from(new Set((p.emails ?? []).map((e) => e.email.split("@")[1]).filter(Boolean)));
  const parts = [];
  if (p.n_emails) parts.push(`${p.n_emails} email${p.n_emails > 1 ? "s" : ""}${domains.length ? ` (@${domains.join(", @")})` : ""}`);
  if (p.n_phones) parts.push(`${p.n_phones} phone${p.n_phones > 1 ? "s" : ""}`);
  const notes = parts.length ? [`SalesQL has ${parts.join(", ")}`] : [];
  if (p.organization?.uuid && p.organization.name && !searchedOrgUuids.includes(p.organization.uuid)) notes.push(`Also at: ${p.organization.name}`);
  return notes.join(" · ") || null;
};

/** SalesQL Prospector: company → org UUIDs (web token) → free `search_people` by titles (API key). */
async function runSalesqlJob(job: Job, companies: string[], keywords: string[], settings: ToolSettings) {
  const jobId = job.id;
  const total = companies.length;
  await prisma.searchJob.update({ where: { id: jobId }, data: { status: "running", startedAt: new Date(), total, progress: 0 } });

  if (!settings.salesql_api_key) return failJob(jobId, "SalesQL API key not set — add it in Settings.");
  if (!settings.salesql_web_token) return failJob(jobId, "SalesQL web token (sql_token cookie) not set — needed to look companies up. Add it in Settings → SalesQL.");

  const log = (line: string) => appendLog(jobId, line);
  let found = 0;
  let progress = 0;
  try {
    await log(`Starting SalesQL Prospector: ${companies.length} companies × ${keywords.length} designations`);
    for (const company of companies) {
      if (await isCancelled(jobId)) break;
      let org: Awaited<ReturnType<typeof resolveOrganizations>> = null;
      try {
        org = await resolveOrganizations(settings.salesql_web_token, company);
      } catch (e) {
        if (e instanceof SalesqlError && (e.status === 401 || e.status === 403)) throw e;
        await log(`⚠ ${company}: company lookup failed (${(e as Error).message})`);
      }
      if (!org) {
        await log(`✗ ${company}: not found in SalesQL`);
        progress++;
        await prisma.searchJob.update({ where: { id: jobId }, data: { progress } });
        continue;
      }
      await log(`▶ ${company} → ${org.name}${org.uuids.length > 1 ? ` (${org.uuids.length} org records)` : ""}`);

      try {
        const { people, total: matched } = await searchAllPeople(settings.salesql_api_key, { organization_uuids: org.uuids, job_titles: keywords }, job.maxPerCompany);
        let added = 0;
        for (const p of people) {
          const category = matchCategory(`${p.title ?? ""} ${p.headline ?? ""}`, keywords);
          const sameOrg = !!p.organization?.uuid && org.uuids.includes(p.organization.uuid);
          const { created } = await upsertLead({
            company: org.name || company,
            companyDomain: sameOrg ? p.organization?.website_domain || null : null,
            companyUrl: sameOrg ? p.organization?.linkedin_url || null : null,
            fullName: p.full_name,
            title: p.title,
            headline: p.headline,
            location: locationText(p),
            linkedinUrl: p.linkedin_url,
            category,
            source: "salesql",
            notes: availabilityNote(p, org.uuids),
            jobId,
            listId: job.listId,
            ...job._own,
          });
          if (created) added++;
          found++;
        }
        await log(`  ${matched} matching people, took ${people.length} (${added} new)`);
      } catch (e) {
        if (e instanceof SalesqlError && (e.status === 401 || e.status === 402)) throw e;
        await log(`  ⚠ ${(e as Error).message}`);
      }
      progress++;
      await prisma.searchJob.update({ where: { id: jobId }, data: { progress, foundCount: found } });
    }

    const cancelled = await isCancelled(jobId);
    await prisma.searchJob.update({
      where: { id: jobId },
      data: { status: cancelled ? "cancelled" : "done", finishedAt: new Date(), foundCount: found, progress: cancelled ? progress : total },
    });
    await log(cancelled ? "Cancelled." : `Done — ${found} matching people.`);
  } catch (e) {
    const msg = (e as Error).message;
    await log(`✗ ${msg}`);
    await prisma.searchJob.update({ where: { id: jobId }, data: { status: "failed", error: msg, finishedAt: new Date(), foundCount: found } });
  }
}

/** SalesQL Prospector by designation only (no companies): titles + optional country/region/industry filters, saved company-wise. */
async function runTitleJob(job: Job, keywords: string[], settings: ToolSettings) {
  const jobId = job.id;
  const limit = Math.max(1, job.maxPerCompany);
  const pages = Math.ceil(limit / 100);
  await prisma.searchJob.update({ where: { id: jobId }, data: { status: "running", startedAt: new Date(), total: pages + 1, progress: 0 } });
  if (!settings.salesql_api_key) return failJob(jobId, "SalesQL API key not set — add it in Settings.");

  const log = (line: string) => appendLog(jobId, line);
  const f = parseFilters(job.filters);
  let found = 0;
  try {
    await log(`Starting SalesQL designation search: ${keywords.join(", ")} (max ${limit} people)`);
    const params: Omit<SearchPeopleParams, "page" | "page_size"> = { job_titles: keywords };
    for (const [key, type, label] of [["countries", "country", "Country"], ["regions", "region", "Region/City"], ["industries", "industry", "Industry"]] as const) {
      const inputs = f[key] ?? [];
      if (!inputs.length) continue;
      const r = await resolveLookup(settings.salesql_api_key, type, inputs);
      if (r.matched.length) await log(`${label}: ${r.matched.join(", ")}`);
      if (r.missing.length) await log(`⚠ ${label} not found in SalesQL, ignored: ${r.missing.join(", ")}`);
      if (r.ids.length) {
        if (key === "countries") params.countries = r.ids;
        else if (key === "regions") params.states_or_cities = r.ids;
        else params.industries = r.ids;
      }
    }
    if (f.hasEmail) params.has_emails = true;
    if (f.hasPhone) params.has_phones = true;
    await prisma.searchJob.update({ where: { id: jobId }, data: { progress: 1 } });
    if (await isCancelled(jobId)) throw new Error("cancelled");

    const { people, total: matched } = await searchAllPeople(settings.salesql_api_key, params, limit);
    await log(`${matched} matching people in SalesQL, saving ${people.length}…`);
    let added = 0;
    let skipped = 0;
    const strict = f.strictTitle !== false;
    for (const p of people) {
      if (found % 100 === 0 && (await isCancelled(jobId))) break;
      const text = `${p.title ?? ""} ${p.headline ?? ""}`;
      if (strict && !titleMatches(text, keywords)) {
        skipped++;
        continue;
      }
      const category = matchCategory(text, keywords) || keywords[0];
      const { created } = await upsertLead({
        company: p.organization?.name || "Unknown company",
        companyDomain: p.organization?.website_domain || null,
        companyUrl: p.organization?.linkedin_url || null,
        fullName: p.full_name,
        title: p.title,
        headline: p.headline,
        location: locationText(p),
        linkedinUrl: p.linkedin_url,
        category,
        source: "salesql",
        notes: availabilityNote(p, p.organization?.uuid ? [p.organization.uuid] : []),
        jobId,
        listId: job.listId,
        ...job._own,
      });
      if (created) added++;
      found++;
      if (found % 100 === 0) await prisma.searchJob.update({ where: { id: jobId }, data: { progress: 1 + Math.ceil(found / 100), foundCount: found } });
    }
    const cancelled = await isCancelled(jobId);
    await prisma.searchJob.update({
      where: { id: jobId },
      data: { status: cancelled ? "cancelled" : "done", finishedAt: new Date(), foundCount: found, progress: pages + 1 },
    });
    await log(cancelled ? "Cancelled." : `Done — ${found} people saved (${added} new)${skipped ? `, ${skipped} skipped (current title doesn't match the designation)` : ""}.`);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "cancelled") {
      await prisma.searchJob.update({ where: { id: jobId }, data: { status: "cancelled", finishedAt: new Date(), foundCount: found } });
      return log("Cancelled.");
    }
    await log(`✗ ${msg}`);
    await prisma.searchJob.update({ where: { id: jobId }, data: { status: "failed", error: msg, finishedAt: new Date(), foundCount: found } });
  }
}

async function runLinkedinJob(job: Job, companies: string[], keywords: string[], settings: ToolSettings) {
  const jobId = job.id;
  const total = companies.length * Math.max(1, keywords.length);
  await prisma.searchJob.update({ where: { id: jobId }, data: { status: "running", startedAt: new Date(), total, progress: 0 } });

  if (!settings.linkedin_li_at) return failJob(jobId, "LinkedIn cookie (li_at) not set — add it in Settings.");

  const log = (line: string) => appendLog(jobId, line);
  const pageLimit = Number(settings.linkedin_daily_page_limit) || 120;
  const session = new LinkedInSession({
    liAt: settings.linkedin_li_at,
    minDelayMs: Number(settings.linkedin_min_delay_ms) || 3500,
    maxDelayMs: Number(settings.linkedin_max_delay_ms) || 8000,
    log: (l) => void log(l),
  });

  let found = 0;
  let progress = 0;
  try {
    await log(`Starting: ${companies.length} companies × ${keywords.length} keywords`);
    await session.open();

    for (const company of companies) {
      if (await isCancelled(jobId)) break;
      if (session.pagesVisited >= pageLimit) {
        await log(`Daily LinkedIn page limit (${pageLimit}) reached — stopping to protect your account.`);
        break;
      }
      let co: { url: string; name: string } | null = null;
      try {
        co = await session.findCompany(company);
      } catch (e) {
        if (e instanceof LinkedInAuthError) throw e;
        await log(`⚠ ${company}: company lookup failed (${(e as Error).message})`);
      }
      if (!co) {
        await log(`✗ ${company}: company not found on LinkedIn`);
        progress += Math.max(1, keywords.length);
        await prisma.searchJob.update({ where: { id: jobId }, data: { progress } });
        continue;
      }
      await log(`▶ ${company} → ${co.url}`);

      const seenUrls = new Set<string>();
      for (const keyword of keywords.length ? keywords : [""]) {
        if (await isCancelled(jobId)) break;
        try {
          const people = await session.companyPeople(co.url, keyword, job.maxPerCompany);
          let added = 0;
          for (const p of people) {
            if (p.linkedinUrl && seenUrls.has(p.linkedinUrl)) continue;
            if (p.linkedinUrl) seenUrls.add(p.linkedinUrl);
            const category = matchCategory(`${p.title ?? ""}`, keywords) || keyword || null;
            const { created } = await upsertLead({
              company: co.name || company,
              companyUrl: co.url,
              fullName: p.fullName,
              title: p.title,
              location: p.location,
              linkedinUrl: p.linkedinUrl,
              category,
              source: "linkedin",
              jobId,
              listId: job.listId,
              ...job._own,
            });
            if (created) added++;
            found++;
          }
          await log(`  "${keyword || "all"}": ${people.length} people (${added} new)`);
        } catch (e) {
          if (e instanceof LinkedInAuthError) throw e;
          await log(`  ⚠ "${keyword}": ${(e as Error).message}`);
        }
        progress++;
        await prisma.searchJob.update({ where: { id: jobId }, data: { progress, foundCount: found } });
      }
    }

    const cancelled = await isCancelled(jobId);
    await prisma.searchJob.update({
      where: { id: jobId },
      data: { status: cancelled ? "cancelled" : "done", finishedAt: new Date(), foundCount: found, progress: cancelled ? progress : total },
    });
    await log(cancelled ? "Cancelled." : `Done — ${found} matching people.`);
  } catch (e) {
    const msg = (e as Error).message;
    await log(`✗ ${msg}`);
    await prisma.searchJob.update({ where: { id: jobId }, data: { status: "failed", error: msg, finishedAt: new Date(), foundCount: found } });
  } finally {
    await session.close();
  }
}
