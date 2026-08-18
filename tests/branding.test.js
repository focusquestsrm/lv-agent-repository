import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("centralized Hub branding selects both appearance assets and provides fallbacks", () => {
  const source = readFileSync(new URL("../src/components/branding/BrandLogo.jsx", import.meta.url), "utf8");
  assert.match(source, /the-hub-logo-light\.png/);
  assert.match(source, /the-hub-logo-dark\.png/);
  assert.match(source, /APP_LOGO_URL/);
  assert.match(source, /The Hub – Powering Lead Ventures/);
  assert.match(source, /onError=\{fallback\}/);
});

test("temporary logo sheet and its two application crops are retained", () => {
  for (const file of ["the-hub-logo-sheet.png", "the-hub-logo-light.png", "the-hub-logo-dark.png"]) {
    assert.equal(existsSync(new URL(`../src/assets/branding/${file}`, import.meta.url)), true, `${file} should exist`);
  }
});

test("primary application placements use BrandLogo instead of duplicated image paths", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /import BrandLogo from "\.\/components\/branding\/BrandLogo"/);
  assert.ok((app.match(/<BrandLogo/g) || []).length >= 5);
  assert.doesNotMatch(app, /the-hub-logo-(?:light|dark)\.png/);
});
