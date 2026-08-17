const categories = ["Fairness & bias", "Privacy & data", "Accuracy & grounding", "Safety & oversight", "Transparency", "Security"];
const system = "You are an enterprise AI governance reviewer. Assess only evidence in the submitted repository resource. Do not invent risks. Low risk stays low. Medium, high, or critical risk requires a concrete actionable finding. Return JSON only with risk_level, governance_score, summary, and exactly six checks. Each check must contain category, score, status (passed, attention, or failed), and findings.";

async function getSettings() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return {};
  const response = await fetch(`${base}/rest/v1/app_settings?select=setting_key,setting_value`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!response.ok) return {};
  return Object.fromEntries((await response.json()).map((x) => [x.setting_key, x.setting_value]));
}

async function callAnthropic(entry, model) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured in Netlify.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: model || "claude-sonnet-4-20250514", max_tokens: 1600, temperature: 0, system, messages: [{ role: "user", content: JSON.stringify(entry) }] }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Claude request failed.");
  return JSON.parse(data.content?.find((x) => x.type === "text")?.text || "{}");
}

async function callOpenAI(entry, model) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured in Netlify.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: model || "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(entry) }] }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OpenAI request failed.");
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function callGemini(entry, model) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured in Netlify.");
  const selected = encodeURIComponent(model || "gemini-2.5-flash");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selected}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: JSON.stringify(entry) }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gemini request failed.");
  return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
}

function validate(result) {
  if (!["low", "medium", "high", "critical"].includes(result.risk_level)) throw new Error("The provider returned an invalid risk level.");
  if (!Number.isInteger(result.governance_score) || result.governance_score < 0 || result.governance_score > 100) throw new Error("The provider returned an invalid governance score.");
  if (!Array.isArray(result.checks) || result.checks.length !== 6) throw new Error("The provider returned incomplete governance checks.");
  result.checks = categories.map((category) => {
    const found = result.checks.find((x) => x.category === category) || {};
    return { category, score: Math.max(0, Math.min(100, Number(found.score) || 0)), status: ["passed", "attention", "failed"].includes(found.status) ? found.status : "attention", findings: found.findings || "Review recommended." };
  });
  return result;
}

export default async (request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  try {
    const entry = await request.json();
    const settings = await getSettings();
    const provider = settings.governance_provider || process.env.GOVERNANCE_PROVIDER || "anthropic";
    const model = settings.governance_model || "";
    const caller = { anthropic: callAnthropic, openai: callOpenAI, gemini: callGemini }[provider];
    if (!caller) throw new Error("The selected governance provider is not supported.");
    const result = validate(await caller(entry, model));
    const providerName = provider === "openai" ? "OpenAI" : provider === "gemini" ? "Google Gemini" : "Anthropic Claude";
    return Response.json({ ...result, flagged: ["medium", "high", "critical"].includes(result.risk_level), provider: providerName });
  } catch (error) {
    console.error("Governance assessment error", error.message);
    return Response.json({ error: error.message || "Governance assessment could not be completed." }, { status: 502 });
  }
};
