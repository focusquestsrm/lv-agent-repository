import { createClient } from "@supabase/supabase-js";

const SYSTEM = `You compare two enterprise resource records only after deterministic duplicate screening. Return JSON only with classification (probable_duplicate|similar|overlapping|complementary|distinct), confidence (integer 0-100), shared_purpose (array of short strings), key_differences (array of short strings), reasoning_summary (concise string), and recommended_action (review_for_merge|relate_resources|keep_separate|insufficient_information). Never merge, delete, retire, modify, or approve a resource. Do not infer sensitive facts.`;
const CLASSIFICATIONS = ["probable_duplicate", "similar", "overlapping", "complementary", "distinct"];
const ACTIONS = ["review_for_merge", "relate_resources", "keep_separate", "insufficient_information"];
const stripFence = (value = "") => value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
const keyFor = (provider) => provider === "openai" ? process.env.OPENAI_API_KEY : provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;

async function callProvider(provider, model, payload) {
  const key = keyFor(provider);
  if (!key) throw new Error("Semantic duplicate review is not configured. Deterministic review remains available.");
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model: model || "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(payload) }] }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "OpenAI semantic review failed."); return JSON.parse(stripFence(data.choices?.[0]?.message?.content));
  }
  if (provider === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash")}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: JSON.stringify(payload) }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Gemini semantic review failed."); return JSON.parse(stripFence(data.candidates?.[0]?.content?.parts?.[0]?.text));
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 1800, temperature: 0, system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(payload) }] }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Anthropic semantic review failed."); return JSON.parse(stripFence(data.content?.find((item) => item.type === "text")?.text));
}

function validate(result) {
  if (!result || !CLASSIFICATIONS.includes(result.classification) || !ACTIONS.includes(result.recommended_action)) throw new Error("The AI provider returned an invalid duplicate-review classification.");
  return { classification: result.classification, confidence: Math.max(0, Math.min(100, Math.round(Number(result.confidence) || 0))), shared_purpose: Array.isArray(result.shared_purpose) ? result.shared_purpose.map(String).slice(0, 8) : [], key_differences: Array.isArray(result.key_differences) ? result.key_differences.map(String).slice(0, 8) : [], reasoning_summary: String(result.reasoning_summary || "Insufficient information was returned.").slice(0, 1500), recommended_action: result.recommended_action };
}

function comparisonView(resource, platform) {
  const allowed = ["id", "name", "entry_type", "purpose", "description", "skills_summary", "intended_users", "company_id", "department", "category", "integrations", "hosting_environment", "platform", "product_family", "commercial_status", "target_market"];
  return { ...Object.fromEntries(allowed.map((field) => [field, resource?.[field] ?? null])), platform_details: platform ? { vendor: platform.vendor, access_instructions: platform.access_instructions, support_contact: platform.support_contact } : null };
}

export default async function handler(request) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!base || !anon || !service || !token) return Response.json({ error: "Semantic duplicate review is not configured." }, { status: 500 });
  const userClient = createClient(base, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }), adminClient = createClient(base, service, { auth: { persistSession: false } });
  try {
    const { data: auth } = await userClient.auth.getUser(), user = auth?.user;
    const { data: profile } = user ? await adminClient.from("profiles").select("role,status,tenant_key").eq("id", user.id).maybeSingle() : { data: null };
    if (!user || profile?.role !== "admin" || profile?.status !== "active") return Response.json({ error: "Active Admin access is required." }, { status: 403 });
    const { matchId } = await request.json();
    const { data: match, error: matchError } = await adminClient.from("resource_duplicate_matches").select("*").eq("id", matchId).maybeSingle();
    if (matchError || !match || match.tenant_key !== profile.tenant_key) return Response.json({ error: "Duplicate candidate was not found in your tenant." }, { status: 404 });
    if (match.similarity_score < 45) return Response.json({ error: "Semantic review requires a deterministic score of at least 45%." }, { status: 422 });
    const ids = [match.resource_id, match.matching_resource_id];
    const [{ data: records, error: recordError }, { data: platformDetails }, { data: settings }] = await Promise.all([adminClient.from("agents").select("*").in("id", ids).eq("tenant_key", profile.tenant_key), adminClient.from("platform_details").select("*").in("agent_id", ids), adminClient.from("app_settings").select("setting_key,setting_value")]);
    if (recordError || records?.length !== 2) throw new Error("Both authorized resource records are required for semantic review.");
    const values = Object.fromEntries((settings || []).map((item) => [item.setting_key, item.setting_value])), provider = values.governance_provider || process.env.GOVERNANCE_PROVIDER || "anthropic", model = values.governance_model || "";
    const resource = records.find((item) => item.id === match.resource_id), matching = records.find((item) => item.id === match.matching_resource_id);
    const result = validate(await callProvider(provider, model, { deterministic_score: match.similarity_score, deterministic_reasons: match.reasons, deterministic_details: match.deterministic_details, resource: comparisonView(resource, platformDetails?.find((item) => item.agent_id === resource.id)), possible_match: comparisonView(matching, platformDetails?.find((item) => item.agent_id === matching.id)) }));
    const { error: updateError } = await adminClient.from("resource_duplicate_matches").update({ ai_classification: result.classification, ai_confidence: result.confidence, ai_shared_purpose: result.shared_purpose, ai_key_differences: result.key_differences, ai_reasoning_summary: result.reasoning_summary, ai_recommended_action: result.recommended_action, ai_provider: provider, ai_model: model || null, ai_reviewed_at: new Date().toISOString() }).eq("id", match.id).eq("tenant_key", profile.tenant_key);
    if (updateError) throw updateError;
    await adminClient.from("audit_log").insert({ actor_id: user.id, action: "duplicate_semantic_review_requested", entity_type: "resource_duplicate_matches", entity_id: match.id, details: { tenant_key: profile.tenant_key, provider, deterministic_score: match.similarity_score, classification: result.classification, recommendation: result.recommended_action, resource_records_unchanged: true } });
    return Response.json({ result });
  } catch (error) { console.error("Semantic duplicate review failed", error?.message); return Response.json({ error: error?.message || "Semantic duplicate review could not be completed." }, { status: 502 }); }
}

export const config = { path: "/api/duplicate-review" };
