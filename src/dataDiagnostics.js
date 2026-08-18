const MAX_DIAGNOSTIC_LENGTH = 600;

export function sanitizeDiagnosticText(value) {
  if (value == null) return null;
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/eyJ[A-Za-z0-9._~-]{20,}/g, "[REDACTED_TOKEN]")
    .replace(/([?&](?:token|apikey|key|access_token|refresh_token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DIAGNOSTIC_LENGTH) || null;
}

function referenceId() {
  const id = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 10);
  return `HUB-${(id || Math.random().toString(36).slice(2, 12)).toUpperCase()}`;
}

export function reportDataFailure({ operation, table, result, error = result?.error }) {
  const reference = referenceId();
  const diagnostic = {
    reference,
    operation: sanitizeDiagnosticText(operation) || "UNKNOWN",
    table: sanitizeDiagnosticText(table) || "unknown",
    code: sanitizeDiagnosticText(error?.code) || "unknown",
    status: Number.isFinite(result?.status) ? result.status : Number.isFinite(error?.status) ? error.status : null,
    message: sanitizeDiagnosticText(error?.message),
    details: sanitizeDiagnosticText(error?.details),
    hint: sanitizeDiagnosticText(error?.hint),
  };
  console.error("The Hub data operation failed", diagnostic);
  return reference;
}

export async function runDataRequest({ operation = "SELECT", table, request }) {
  let result;
  try {
    result = await request;
  } catch (error) {
    result = { data: null, error, status: error?.status ?? null };
  }
  if (!result?.error) return result;
  return { ...result, diagnosticReference: reportDataFailure({ operation, table, result }) };
}
