import { createClient } from "@supabase/supabase-js";

const NOTICE = "AI-generated recommendations are advisory and require review by an authorized Admin. They do not constitute legal, regulatory, privacy, security, or compliance certification.";
const SYSTEM = `You are an advisory enterprise AI governance analyst. The deterministic assessment is the official result and you must not alter it. Analyze only the supplied repository metadata and questionnaire evidence. Never claim certification. Return JSON only with: executive_summary, advisory_score (integer 0-100), advisory_risk (low|medium|high|critical), concerns (array), evidence (array), missing_information (array), clarification_questions (array), recommended_decision (Approve|Approve With Conditions|Request Clarification|Request Changes|Reject), residual_risk, comparison (object with resolved, reduced, unchanged, and new arrays), and recommendations (array). Every recommendation must include category, concern, impact, recommended_action, evidence_required, responsible_role, priority (Critical|Required Before Approval|High|Medium|Best Practice), plan_phase (Immediate|Short-term|Ongoing), suggested_timeframe, expected_score_improvement (integer), and residual_risk. Include tailored recommendations for every weak category. Immediate actions address blocking issues, Short-term actions are due within 30 days, and Ongoing actions are monitoring or recurring controls. When a previous advisory is supplied, compare it explicitly; otherwise return empty comparison arrays. ${NOTICE}`;

function envFor(provider) {
  return provider === "openai" ? process.env.OPENAI_API_KEY : provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
}
function stripFence(value = "") { return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); }
async function callProvider(provider, model, payload) {
  const key = envFor(provider);
  if (!key) throw new Error("AI-assisted assessment is not configured. The deterministic governance assessment remains available.");
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model: model || "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: JSON.stringify(payload) }] }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "OpenAI advisory request failed."); return JSON.parse(stripFence(data.choices?.[0]?.message?.content));
  }
  if (provider === "gemini") {
    const selected = encodeURIComponent(model || "gemini-2.5-flash");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selected}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ parts: [{ text: JSON.stringify(payload) }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Gemini advisory request failed."); return JSON.parse(stripFence(data.candidates?.[0]?.content?.parts?.[0]?.text));
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 5000, temperature: 0, system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(payload) }] }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Claude advisory request failed."); return JSON.parse(stripFence(data.content?.find((item) => item.type === "text")?.text));
}
function validOutput(result) {
  if (!result || !Number.isInteger(Number(result.advisory_score)) || !["low","medium","high","critical"].includes(result.advisory_risk) || !Array.isArray(result.recommendations)) throw new Error("The provider returned an incomplete advisory assessment.");
  if (!["Approve","Approve With Conditions","Request Clarification","Request Changes","Reject"].includes(result.recommended_decision)) result.recommended_decision = "Request Clarification";
  return result;
}

export default async function handler(request) {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!base || !anon || !service || !token) return Response.json({ error: "AI advisory service is not configured." }, { status: 500 });
  const userClient = createClient(base, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const adminClient = createClient(base, service, { auth: { persistSession: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  const { data: profile } = user ? await adminClient.from("profiles").select("role,status").eq("id", user.id).maybeSingle() : { data: null };
  if (!user || profile?.role !== "admin" || profile?.status !== "active") return Response.json({ error: "Active Admin access is required." }, { status: 403 });
  const { data: settings } = await adminClient.from("app_settings").select("setting_key,setting_value");
  const values = Object.fromEntries((settings || []).map((item) => [item.setting_key, item.setting_value]));
  const provider = values.governance_provider || process.env.GOVERNANCE_PROVIDER || "anthropic";
  const model = values.governance_model || "";
  const configured = Boolean(envFor(provider));
  if (request.method === "GET") return Response.json({ configured, provider, model, notice: NOTICE });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  if (!configured) return Response.json({ error: "AI-assisted assessment is not configured. The deterministic governance assessment remains available." }, { status: 503 });
  try {
    const { assessmentId } = await request.json();
    const { data: assessment, error } = await adminClient.from("governance_assessments").select("*").eq("id", assessmentId).single();
    if (error || !assessment) throw new Error("Deterministic assessment not found.");
    const { data: agent } = await adminClient.from("agents").select("id,name,entry_type,description,category,department,platform,environment,uses_database,uses_api,uses_sensitive_data,crosses_departments,owner_name").eq("id", assessment.agent_id).single();
    const { data: previous } = await adminClient.from("ai_advisory_assessments").select("output").eq("agent_id", assessment.agent_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const result = validOutput(await callProvider(provider, model, { resource: agent, official_deterministic_assessment: assessment, previous_advisory: previous?.output || null, instruction: "Provide actionable remediation without changing the official result." }));
    const { count } = await adminClient.from("ai_advisory_assessments").select("id", { count: "exact", head: true }).eq("assessment_id", assessment.id);
    const { data: advisory, error: advisoryError } = await adminClient.from("ai_advisory_assessments").insert({ assessment_id: assessment.id, agent_id: assessment.agent_id, advisory_number: (count || 0) + 1, requested_by: user.id, provider, model: model || null, advisory_score: Math.max(0, Math.min(100, Number(result.advisory_score))), advisory_risk: result.advisory_risk, executive_summary: result.executive_summary, recommended_decision: result.recommended_decision, output: { ...result, notice: NOTICE } }).select().single();
    if (advisoryError) throw advisoryError;
    const allowedPriority = ["Critical","Required Before Approval","High","Medium","Best Practice"];
    const allowedPhase = ["Immediate","Short-term","Ongoing"];
    const rows = result.recommendations.map((item) => ({ advisory_id: advisory.id, agent_id: assessment.agent_id, category: item.category || "General", concern: item.concern || "Governance concern", impact: item.impact || null, recommended_action: item.recommended_action || "Document and implement an appropriate control.", evidence_required: item.evidence_required || null, responsible_role: item.responsible_role || "Accountable owner", priority: allowedPriority.includes(item.priority) ? item.priority : "Medium", plan_phase: allowedPhase.includes(item.plan_phase) ? item.plan_phase : "Short-term", suggested_timeframe: item.suggested_timeframe || null, expected_score_improvement: Number.isInteger(Number(item.expected_score_improvement)) ? Number(item.expected_score_improvement) : 0, residual_risk: item.residual_risk || null }));
    if (rows.length) { const { error: recommendationError } = await adminClient.from("governance_recommendations").insert(rows); if (recommendationError) throw recommendationError; }
    await adminClient.from("audit_log").insert({ actor_id: user.id, action: "ai_advisory_requested", entity_type: "ai_advisory_assessments", entity_id: advisory.id, details: { agent_id: assessment.agent_id, assessment_id: assessment.id, provider, official_score_unchanged: assessment.overall_score, official_risk_unchanged: assessment.final_risk } });
    return Response.json({ advisoryId: advisory.id, notice: NOTICE });
  } catch (error) {
    console.error("AI advisory failed", error?.message);
    return Response.json({ error: error?.message || "AI-assisted assessment could not be completed." }, { status: 502 });
  }
}

export const config = { path: "/api/ai-advisory" };
