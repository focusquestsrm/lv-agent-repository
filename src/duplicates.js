const TRACKING_PARAMETERS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"]);
const STOP_WORDS = new Set(["and", "the", "for", "with", "from", "that", "this", "into", "our", "your", "their", "platform", "product", "agent", "skillset"]);
export const DUPLICATE_AI_THRESHOLD = 45;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : value ? [value] : [];

export function normalizeUrl(value = "") {
  const input = text(value);
  if (!input) return "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "").replace(/\/+/g, "/") || "/";
    const params = [...parsed.searchParams.entries()].filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMETERS.has(key.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
    const query = new URLSearchParams(params).toString();
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return input.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

export function normalizeName(value = "") { return text(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
export function acronym(value = "") { return normalizeName(value).split(" ").filter((word) => word && !STOP_WORDS.has(word)).map((word) => word[0]).join(""); }
export function tokenize(...values) { return new Set(values.flat().flatMap(list).filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token))); }

export function tokenSimilarity(left, right) {
  const a = left instanceof Set ? left : tokenize(left), b = right instanceof Set ? right : tokenize(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return Math.round((intersection / (a.size + b.size - intersection)) * 100);
}

function urls(resource) { return [resource?.url, resource?.hosted_url, resource?.repository_url, resource?.product_url, ...list(resource?.alternate_urls)].map(normalizeUrl).filter(Boolean); }
function urlRelation(candidate, existing) {
  for (const a of urls(candidate)) for (const b of urls(existing)) {
    if (a === b) return { score: 100, reason: "Exact normalized URL or repository URL match", matchType: "exact_url", matchedUrl: a };
    const hostA = a.split("/")[0], hostB = b.split("/")[0];
    if (hostA === hostB) return { score: 82, reason: "Same host with a different path", matchType: "same_host", matchedUrl: `${a} / ${b}` };
    const rootA = hostA.split(".").slice(-2).join("."), rootB = hostB.split(".").slice(-2).join(".");
    if (rootA === rootB) return { score: 72, reason: "Closely related subdomains", matchType: "related_subdomain", matchedUrl: `${a} / ${b}` };
  }
  return null;
}

function sameValue(left, right) { const a = normalizeName(left), b = normalizeName(right); return Boolean(a && b && a === b); }

export function compareResources(candidate, existing) {
  const url = urlRelation(candidate, existing), exactName = sameValue(candidate.name, existing.name);
  const candidateAcronym = acronym(candidate.name), existingAcronym = acronym(existing.name);
  const acronymMatch = !exactName && ((candidateAcronym.length > 1 && candidateAcronym === normalizeName(existing.name).replaceAll(" ", "")) || (existingAcronym.length > 1 && existingAcronym === normalizeName(candidate.name).replaceAll(" ", "")));
  const nameScore = tokenSimilarity(candidate.name, existing.name);
  const descriptionScore = tokenSimilarity(candidate.description, existing.description);
  const purposeScore = tokenSimilarity(candidate.purpose || candidate.business_problem, existing.purpose || existing.business_problem);
  const capabilityScore = tokenSimilarity(candidate.skills_summary || candidate.capabilities, existing.skills_summary || existing.capabilities);
  const integrationScore = tokenSimilarity(candidate.integrations, existing.integrations);
  const audienceScore = tokenSimilarity(candidate.intended_users, existing.intended_users);
  const overallKeywordScore = tokenSimilarity(tokenize(candidate.name, candidate.description, candidate.purpose, candidate.business_problem, candidate.skills_summary, candidate.capabilities, candidate.category, candidate.intended_users, candidate.integrations), tokenize(existing.name, existing.description, existing.purpose, existing.business_problem, existing.skills_summary, existing.capabilities, existing.category, existing.intended_users, existing.integrations));
  const sameVendor = sameValue(candidate.vendor_product_identifier || candidate.vendor, existing.vendor_product_identifier || existing.vendor);
  const samePlatform = sameValue(candidate.external_platform || candidate.platform, existing.external_platform || existing.platform);
  const sameCompanyOwner = Boolean(candidate.company_id && candidate.company_id === existing.company_id && candidate.owner_name && sameValue(candidate.owner_name, existing.owner_name));
  const sameType = Boolean(candidate.entry_type && candidate.entry_type === existing.entry_type);
  let score = Math.max(overallKeywordScore, nameScore, url?.score || 0), matchType = url?.matchType || "description";
  const reasons = [];
  if (url) reasons.push(url.reason);
  if (exactName) { score = 100; matchType = "exact_name"; reasons.push("Exact normalized resource name"); }
  else if (acronymMatch) { score = Math.max(score, 86); matchType = "acronym"; reasons.push("Name and acronym match"); }
  else if (nameScore >= 35) reasons.push(`${nameScore}% normalized-name similarity`);
  if (sameVendor) { score = Math.max(score, 92); matchType = "exact_vendor"; reasons.push("Same vendor or product identifier"); }
  if (samePlatform) { score = Math.max(score, 88); matchType = "exact_platform"; reasons.push("Same external platform"); }
  if (sameCompanyOwner) { score = Math.min(100, score + 8); reasons.push("Same company and accountable owner"); }
  if (sameType) { score = Math.min(100, score + 3); reasons.push("Same resource type"); }
  if (descriptionScore >= 25) reasons.push(`${descriptionScore}% description similarity`);
  if (purposeScore >= 25) reasons.push(`${purposeScore}% purpose/business-problem overlap`);
  if (capabilityScore >= 25) reasons.push(`${capabilityScore}% capability overlap`);
  if (integrationScore >= 25) reasons.push(`${integrationScore}% integration overlap`);
  if (audienceScore >= 35) reasons.push(`${audienceScore}% intended-user overlap`);
  if (overallKeywordScore >= 25) reasons.push(`${overallKeywordScore}% combined keyword similarity`);
  if (candidate.company_id && candidate.company_id === existing.company_id) { score = Math.min(100, score + 5); reasons.push("Same company"); }
  const stagesA = new Set(candidate.lifecycle_stage_ids || []), stagesB = new Set(existing.lifecycle_stage_ids || []);
  if ([...stagesA].some((id) => stagesB.has(id))) { score = Math.min(100, score + 8); reasons.push("Shared lifecycle stage"); }
  const deterministicDetails = { exactName, exactUrl: url?.matchType === "exact_url", sameVendor, samePlatform, sameCompanyOwner, sameType, acronymMatch, nameScore, descriptionScore, purposeScore, capabilityScore, integrationScore, audienceScore, overallKeywordScore };
  return { resourceId: existing.id, score, reasons: [...new Set(reasons)], matchType, matchedUrl: url?.matchedUrl || null, exactUrl: url?.matchType === "exact_url", aiEligible: score >= DUPLICATE_AI_THRESHOLD, deterministicDetails };
}

export function findDuplicates(candidate, resources = [], minimumScore = 30) { return resources.filter((item) => item.id !== candidate.id).map((item) => ({ ...compareResources(candidate, item), resource: item })).filter((match) => match.score >= minimumScore).sort((a, b) => b.score - a.score); }

export function buildDuplicateCandidates(resources = [], minimumScore = 30) {
  const candidates = [];
  for (let left = 0; left < resources.length; left += 1) for (let right = left + 1; right < resources.length; right += 1) {
    const a = resources[left], b = resources[right];
    if (!a?.id || !b?.id) continue;
    const [resource, matching] = String(a.id).localeCompare(String(b.id)) <= 0 ? [a, b] : [b, a];
    const comparison = compareResources(resource, matching);
    if (comparison.score >= minimumScore) candidates.push({ ...comparison, resourceId: resource.id, matchingResourceId: matching.id, resource, matchingResource: matching });
  }
  return candidates.sort((a, b) => b.score - a.score);
}
