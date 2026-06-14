import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/lib/repo-map-cache.ts
import { createHash } from "crypto";
import { readFile, stat, writeFile } from "fs/promises";
var CACHE_FILE = ".features/_repo-map-cache.json";
function mtimeFingerprint(files) {
  const sorted = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
  const payload = sorted.map(([p, t]) => `${p}:${t}`).join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
async function fingerprintFiles(root, paths) {
  const mtimes = /* @__PURE__ */ new Map();
  await Promise.all(
    paths.map(async (p) => {
      try {
        const s = await stat(`${root}/${p}`);
        mtimes.set(p, s.mtimeMs);
      } catch {
      }
    })
  );
  return mtimes;
}
function serializeMap(map) {
  return {
    files: map.files.map((f) => ({ path: f.path, symbols: f.symbols, imports: f.imports }))
  };
}
function deserializeMap(s) {
  const files = s.files.map((f) => ({ path: f.path, symbols: f.symbols, imports: f.imports }));
  const symbolIndex = /* @__PURE__ */ new Map();
  for (const f of files) {
    for (const sym of f.symbols) {
      const existing = symbolIndex.get(sym);
      if (existing) existing.push(f.path);
      else symbolIndex.set(sym, [f.path]);
    }
  }
  return { files, symbolIndex };
}
async function loadCachedRepoMap(root, fingerprint) {
  try {
    const raw = await readFile(`${root}/${CACHE_FILE}`, "utf-8");
    const entry = JSON.parse(raw);
    if (entry.fingerprint !== fingerprint) return null;
    return deserializeMap(entry.map);
  } catch {
    return null;
  }
}
async function saveCachedRepoMap(root, fingerprint, map) {
  try {
    const entry = { fingerprint, map: serializeMap(map) };
    await writeFile(`${root}/${CACHE_FILE}`, JSON.stringify(entry), "utf-8");
  } catch {
  }
}
export {
  fingerprintFiles,
  loadCachedRepoMap,
  mtimeFingerprint,
  saveCachedRepoMap
};
