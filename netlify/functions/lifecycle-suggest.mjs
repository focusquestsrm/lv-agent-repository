import { createClient } from "@supabase/supabase-js";

const SYSTEM = `You suggest editable operational lifecycle drafts for an authorized company administrator. Return JSON only with proposal: { phases: [{name, objective, description}], stages: [{name, phase, purpose, activities, entry_criteria, exit_criteria, sequence}], connections: [{source, target, type, label, description, condition, sequence}] }. Phases are optional. Allowed connection types: next, feedback, conditional, nested, supporting. Prefer a clear stages-only structure unless phases materially clarify a complex operation. Never include an existing stage name. Do not claim the suggestion is approved or published.`;
const keyFor = (provider) => provider === "openai" ? process.env.OPENAI_API_KEY : provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
const strip = (value = "") => value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

async function call(provider, model, input) {
  const key = keyFor(provider);
  if (!key) throw new Error("AI lifecycle suggestions are not configured. Continue with the manual visual builder.");
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method:"POST", headers:{"content-type":"application/json",authorization:`Bearer ${key}`}, body:JSON.stringify({model:model||"gpt-4o-mini",temperature:0,response_format:{type:"json_object"},messages:[{role:"system",content:SYSTEM},{role:"user",content:JSON.stringify(input)}]}) });
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message||"OpenAI lifecycle suggestion failed.");return JSON.parse(strip(data.choices?.[0]?.message?.content));
  }
  if (provider === "gemini") {
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model||"gemini-2.5-flash")}:generateContent`,{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:[{parts:[{text:JSON.stringify(input)}]}],generationConfig:{temperature:0,responseMimeType:"application/json"}})});
    const data=await response.json();if(!response.ok)throw new Error(data.error?.message||"Gemini lifecycle suggestion failed.");return JSON.parse(strip(data.candidates?.[0]?.content?.parts?.[0]?.text));
  }
  const response=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:model||"claude-sonnet-4-20250514",max_tokens:3000,temperature:0,system:SYSTEM,messages:[{role:"user",content:JSON.stringify(input)}]})});
  const data=await response.json();if(!response.ok)throw new Error(data.error?.message||"Claude lifecycle suggestion failed.");return JSON.parse(strip(data.content?.find((item)=>item.type==="text")?.text));
}

export default async function handler(request) {
  if (request.method !== "POST") return Response.json({error:"Method not allowed."},{status:405});
  const base=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY,token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!base||!anon||!token)return Response.json({error:"Lifecycle suggestions are not configured. Continue building manually."},{status:503});
  const client=createClient(base,anon,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
  const {data:auth}=await client.auth.getUser();const user=auth?.user;
  const {data:profile}=user?await client.from("profiles").select("role,status").eq("id",user.id).maybeSingle():{data:null};
  if(!user||profile?.role!=="admin"||profile?.status!=="active")return Response.json({error:"Active Admin access is required."},{status:403});
  const {data:settings}=await client.from("app_settings").select("setting_key,setting_value");const values=Object.fromEntries((settings||[]).map((item)=>[item.setting_key,item.setting_value]));const provider=values.governance_provider||process.env.GOVERNANCE_PROVIDER||"anthropic",model=values.governance_model||"";
  if(!keyFor(provider))return Response.json({error:"AI lifecycle suggestions are unavailable because the configured provider has no API key. The manual builder remains fully available."},{status:503});
  try { const input=await request.json();const result=await call(provider,model,input);const proposal=result.proposal||result;if(!Array.isArray(proposal.stages)||!Array.isArray(proposal.connections))throw new Error("The provider returned an incomplete lifecycle suggestion.");return Response.json({proposal,provider,model,notice:"AI suggestion — editable, unapproved, and never published automatically."}); }
  catch(error){console.error("Lifecycle suggestion failed",error?.message);return Response.json({error:error?.message||"AI lifecycle suggestion could not be generated. Continue building manually."},{status:502});}
}

export const config={path:"/api/lifecycle-suggest"};
