import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = new Set([
  "danielle@focusquest.com",
  "sean@focusquest.com",
  "eliana@lead-ventures.com",
  "mcarcamo@back2learn.com",
]);

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

  const authUsers = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error)
      return Response.json({ error: error.message }, { status: 500 });
    authUsers.push(...data.users);
    if (data.users.length < perPage) break;
  }

  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id");
  if (profilesError)
    return Response.json({ error: profilesError.message }, { status: 500 });

  const existingIds = new Set((profiles || []).map((profile) => profile.id));
  const missingProfiles = authUsers
    .filter((authUser) => authUser.email && !existingIds.has(authUser.id))
    .map((authUser) => ({
      id: authUser.id,
      email: authUser.email,
      full_name:
        authUser.user_metadata?.full_name ||
        authUser.user_metadata?.name ||
        "",
      role: ADMIN_EMAILS.has(authUser.email.toLowerCase())
        ? "admin"
        : "editor",
      status: "active",
    }));

  if (missingProfiles.length) {
    const { error } = await adminClient.from("profiles").insert(missingProfiles);
    if (error)
      return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    total: authUsers.length,
    created: missingProfiles.length,
  });
};

export const config = { path: "/api/sync-users" };
