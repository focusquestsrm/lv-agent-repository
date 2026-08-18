export const ARCHIVED_RESOURCE_STATUSES = new Set(["retired", "archived"]);

export function isArchivedResource(resource) {
  return ARCHIVED_RESOURCE_STATUSES.has(resource?.status);
}

export function isPublishedResource(resource) {
  return !isArchivedResource(resource)
    && resource?.status === "approved"
    && resource?.governance_status === "cleared";
}

export function isMyResource(resource, userId) {
  return Boolean(userId)
    && !isArchivedResource(resource)
    && (resource?.created_by === userId || resource?.accountable_owner_id === userId);
}

export function resourceLocations(resource) {
  return isPublishedResource(resource)
    ? ["My Resources", "Resource Directory"]
    : ["My Resources"];
}

export function safeDataError(error, fallback = "The requested data could not be loaded.") {
  if (!error) return "";
  const code = String(error.code || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  const permission = code === "42501" || /permission|row-level security|not authorized/i.test(error.message || "");
  return permission
    ? "You do not have permission to retrieve this information."
    : `${fallback}${code ? ` (Reference ${code})` : ""}`;
}
