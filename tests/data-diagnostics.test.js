import test from "node:test";
import assert from "node:assert/strict";
import { reportDataFailure, runDataRequest, sanitizeDiagnosticText } from "../src/dataDiagnostics.js";

test("database diagnostics contain the required fields and redact credentials and personal data", () => {
  const entries = [];
  const original = console.error;
  console.error = (...args) => entries.push(args);
  try {
    const reference = reportDataFailure({
      operation: "SELECT",
      table: "agents",
      result: { status: 403 },
      error: {
        code: "42501",
        message: "Bearer secret.jwt.value rejected for person@example.com",
        details: "https://example.test/path?access_token=secret",
        hint: "Check the policy",
      },
    });
    assert.match(reference, /^HUB-[A-Z0-9]{10}$/);
    assert.equal(entries.length, 1);
    assert.deepEqual(Object.keys(entries[0][1]), ["reference", "operation", "table", "code", "status", "message", "details", "hint"]);
    assert.equal(entries[0][1].operation, "SELECT");
    assert.equal(entries[0][1].table, "agents");
    assert.equal(entries[0][1].code, "42501");
    assert.equal(entries[0][1].status, 403);
    assert.doesNotMatch(JSON.stringify(entries), /secret|person@example\.com/);
  } finally {
    console.error = original;
  }
});

test("tracked requests distinguish a rejected transport request from a Supabase response", async () => {
  const entries = [];
  const original = console.error;
  console.error = (...args) => entries.push(args);
  try {
    const transport = await runDataRequest({ table: "agents", request: Promise.reject(new TypeError("Failed to fetch")) });
    const database = await runDataRequest({ table: "lifecycle_stages", request: Promise.resolve({ data: null, error: { code: "42P01", message: "relation does not exist", details: null, hint: null }, status: 404 }) });
    assert.equal(transport.error.message, "Failed to fetch");
    assert.match(transport.diagnosticReference, /^HUB-/);
    assert.equal(database.error.code, "42P01");
    assert.match(database.diagnosticReference, /^HUB-/);
    assert.equal(entries[0][1].status, null);
    assert.equal(entries[1][1].status, 404);
  } finally {
    console.error = original;
  }
});

test("diagnostic text is bounded and strips token-bearing query values", () => {
  const value = sanitizeDiagnosticText(`https://example.test/?apikey=private ${"x".repeat(1000)}`);
  assert.match(value, /apikey=\[REDACTED\]/);
  assert.ok(value.length <= 600);
});
