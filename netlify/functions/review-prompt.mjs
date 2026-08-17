import { createClient } from "@supabase/supabase-js";

export default async function reviewPrompt(request) {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed." }, { status: 405 });

  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!base || !anon || !token)
    return Response.json({ error: "Review service is not configured." }, { status: 500 });

  try {
    const { versionId, decision, notes } = await request.json();
    if (!versionId || !["approved", "changes_requested"].includes(decision))
      return Response.json({ error: "A valid review decision is required." }, { status: 400 });

    const client = createClient(base, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { error } = await client.rpc("review_prompt_version", {
      target_version: versionId,
      target_decision: decision,
      review_notes: notes || null,
    });
    if (error) throw error;

    return Response.json({
      message:
        decision === "approved"
          ? "Prompt approved and resource published."
          : "Changes requested from the prompt author.",
    });
  } catch (error) {
    console.error("Prompt review decision failed", {
      message: error?.message,
      code: error?.code,
    });
    return Response.json(
      {
        error:
          error?.message?.includes("cannot approve their own")
            ? "Prompt authors cannot approve their own prompt. A different Admin must approve and publish it."
            : "We could not record this review decision. Please confirm that you have Admin approval access and try again.",
      },
      { status: 403 },
    );
  }
}

export const config = { path: "/api/review-prompt" };
