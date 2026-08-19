const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"]);

export function normalizeUrl(value = "") {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "").replace(/\/+/g, "/") || "/";
    const params = [...parsed.searchParams.entries()]
      .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMETERS.has(key.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = new URLSearchParams(params).toString();
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

export function tokenize(...values) {
  return new Set(values.flat().filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2));
}

export function tokenSimilarity(left, right) {
  const a = left instanceof Set ? left : tokenize(left);
  const b = right instanceof Set ? right : tokenize(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return Math.round((intersection / (a.size + b.size - intersection)) * 100);
}

function urlRelation(candidate, existing) {
  const alternateUrls = (resource) => Array.isArray(resource?.alternate_urls)
    ? resource.alternate_urls
    : resource?.alternate_urls
      ? [resource.alternate_urls]
      : [];
  const urlsA = [candidate?.url, ...alternateUrls(candidate)].map(normalizeUrl).filter(Boolean);
  const urlsB = [existing?.url, ...alternateUrls(existing)].map(normalizeUrl).filter(Boolean);
  for (const a of urlsA) for (const b of urlsB) {
    if (a === b) return { score: 100, reason: "Exact normalized URL match", matchType: "exact_url", matchedUrl: a };
    const hostA = a.split("/")[0], hostB = b.split("/")[0];
    if (hostA === hostB) return { score: 82, reason: "Same host with a different path", matchType: "same_host", matchedUrl: `${a} / ${b}` };
    const rootA = hostA.split(".").slice(-2).join("."), rootB = hostB.split(".").slice(-2).join(".");
    if (rootA === rootB) return { score: 72, reason: "Closely related subdomains", matchType: "related_subdomain", matchedUrl: `${a} / ${b}` };
  }
  return null;
}

export function compareResources(candidate, existing) {
  const url = urlRelation(candidate, existing);
  const textScore = tokenSimilarity(
    tokenize(candidate.name, candidate.description, candidate.purpose, candidate.skills_summary, candidate.category, candidate.intended_users, candidate.integrations),
    tokenize(existing.name, existing.description, existing.purpose, existing.skills_summary, existing.category, existing.intended_users, existing.integrations),
  );
  let score = textScore;
  const reasons = [];
  if (url) { score = Math.max(score, url.score); reasons.push(url.reason); }
  if (textScore >= 25) reasons.push(`${textScore}% keyword similarity across name, purpose, capabilities, category, users, and integrations`);
  if (candidate.company_id && candidate.company_id === existing.company_id) { score = Math.min(100, score + 5); reasons.push("Same company"); }
  const stagesA = new Set(candidate.lifecycle_stage_ids || []), stagesB = new Set(existing.lifecycle_stage_ids || []);
  if ([...stagesA].some((id) => stagesB.has(id))) { score = Math.min(100, score + 8); reasons.push("Shared lifecycle stage"); }
  return { resourceId: existing.id, score, reasons, matchType: url?.matchType || "description", matchedUrl: url?.matchedUrl || null, exactUrl: url?.matchType === "exact_url" };
}

export function findDuplicates(candidate, resources = [], minimumScore = 30) {
  return resources.filter((item) => item.id !== candidate.id).map((item) => ({ ...compareResources(candidate, item), resource: item })).filter((match) => match.score >= minimumScore).sort((a, b) => b.score - a.score);
}
