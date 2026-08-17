import { createClient } from "@supabase/supabase-js";

const VALID_ACTIONS = new Set(["archive", "restore", "delete"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async (req) => {
  if (req.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 });

  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service)
    return Response.json(
      { error: "Server configuration is incomplete." },
      { status: 500 },
    );

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller, error: callerError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerError || caller?.role !== "admin")
    return Response.json({ error: "Admin access required" }, { status: 403 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { id, action } = body;
  if (!UUID_PATTERN.test(id || "") || !VALID_ACTIONS.has(action))
    return Response.json({ error: "Invalid agent action" }, { status: 400 });

  const query =
    action === "delete"
      ? adminClient.from("agents").delete().eq("id", id)
      : adminClient
          .from("agents")
          .update({ status: action === "archive" ? "retired" : "draft" })
          .eq("id", id);
  const { data: agent, error } = await query.select("id,name").single();
  if (error)
    return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ agent, action });
};

export const config = { path: "/api/manage-agent" };
