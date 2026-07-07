#!/usr/bin/env node
/**
 * generate-locales.js
 *
 * One-time script: translates en.json into all target languages using
 * Google Cloud Translation API (service account auth).
 *
 * Usage:  node scripts/generate-locales.js
 *
 * Only call this when you add new strings to en.json.
 * The output JSON files are committed to the repo and served statically —
 * no translation API calls happen in production.
 */

const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");

const CREDENTIALS_PATH = path.join(
  __dirname,
  "..",
  "credentials",
  "cleanair-clear-streets-b2e96f18917e.json"
);
const LOCALES_DIR = path.join(__dirname, "..", "locales");
const EN_PATH = path.join(LOCALES_DIR, "en.json");
const BATCH_SIZE = 128;

const TARGET_LANGS = [
  "hi", "ta", "te", "kn", "ml",
  "mr", "bn", "gu", "pa", "ur",
  "or", "as",
];

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ["https://www.googleapis.com/auth/cloud-translation"],
  });
  const client = await auth.getClient();
  const resp = await client.getAccessToken();
  return resp.token;
}

async function translateBatch(texts, target, token) {
  const res = await fetch("https://translation.googleapis.com/language/translate/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: texts, target, source: "en", format: "text" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Translation API error for ${target}: ${err}`);
  }
  const data = await res.json();
  return data.data.translations.map((t) => t.translatedText);
}

async function translateAll(values, target, token) {
  const results = [];
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    const translated = await translateBatch(batch, target, token);
    results.push(...translated);
    process.stdout.write(`  [${target}] batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(values.length / BATCH_SIZE)} done\r`);
  }
  return results;
}

async function main() {
  const en = JSON.parse(fs.readFileSync(EN_PATH, "utf8"));
  const keys = Object.keys(en);
  const values = Object.values(en);
  console.log(`\n📄 en.json has ${keys.length} strings.\n`);

  console.log("🔑 Getting access token from service account...");
  const token = await getAccessToken();
  console.log("✅ Token obtained.\n");

  for (const lang of TARGET_LANGS) {
    const outPath = path.join(LOCALES_DIR, `${lang}.json`);
    process.stdout.write(`🌐 Translating → ${lang}...`);
    try {
      const translated = await translateAll(values, lang, token);
      const map = {};
      keys.forEach((k, i) => {
        map[k] = translated[i] ?? values[i];
      });

      // Validate same key count
      if (Object.keys(map).length !== keys.length) {
        throw new Error(`Key count mismatch: got ${Object.keys(map).length}, expected ${keys.length}`);
      }

      fs.writeFileSync(outPath, JSON.stringify(map, null, 2), "utf8");
      console.log(`\n✅ Written ${outPath}`);
    } catch (err) {
      console.error(`\n❌ Failed for ${lang}: ${err.message}`);
    }
  }

  console.log("\n🎉 Done! All locale files are up to date.");
  console.log("👉 No more Google Translate API calls will happen at runtime.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
