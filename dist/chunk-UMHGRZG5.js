import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/codemap/repo-map.ts
import { dirname as dirname2, join as join2, normalize } from "path";

// src/verify/symbol-resolver.ts
import Parser from "web-tree-sitter";

// src/verify/languages.ts
import { createRequire } from "module";
import { dirname, extname, join } from "path";
var require2 = createRequire(import.meta.url);
var EXTENSION_MAP = {
  ".ts": { grammar: "typescript", tag: "ts" },
  ".mts": { grammar: "typescript", tag: "ts" },
  ".cts": { grammar: "typescript", tag: "ts" },
  ".tsx": { grammar: "tsx", tag: "tsx" },
  ".js": { grammar: "javascript", tag: "js" },
  ".mjs": { grammar: "javascript", tag: "js" },
  ".cjs": { grammar: "javascript", tag: "js" },
  ".jsx": { grammar: "javascript", tag: "jsx" },
  ".py": { grammar: "python", tag: "python" },
  ".go": { grammar: "go", tag: "go" },
  ".rs": { grammar: "rust", tag: "rust" },
  ".java": { grammar: "java", tag: "java" },
  ".rb": { grammar: "ruby", tag: "ruby" },
  ".php": { grammar: "php", tag: "php" },
  ".cs": { grammar: "c_sharp", tag: "csharp" },
  ".c": { grammar: "c", tag: "c" },
  ".h": { grammar: "c", tag: "c" },
  ".cpp": { grammar: "cpp", tag: "cpp" },
  ".hpp": { grammar: "cpp", tag: "cpp" },
  ".swift": { grammar: "swift", tag: "swift" },
  ".kt": { grammar: "kotlin", tag: "kotlin" },
  ".scala": { grammar: "scala", tag: "scala" },
  ".lua": { grammar: "lua", tag: "lua" }
};
var TAG_ONLY = {
  ".css": "css",
  ".scss": "css",
  ".html": "html",
  ".json": "json",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".md": "md",
  ".sh": "bash",
  ".sql": "sql",
  ".vue": "vue",
  ".svelte": "svelte"
};
function grammarFor(path) {
  return EXTENSION_MAP[extname(path).toLowerCase()]?.grammar;
}
function langTagFor(path) {
  const ext = extname(path).toLowerCase();
  return EXTENSION_MAP[ext]?.tag ?? TAG_ONLY[ext] ?? ext.replace(/^\./, "");
}
function wasmPathFor(grammar) {
  const pkgDir = dirname(require2.resolve("tree-sitter-wasms/package.json"));
  return join(pkgDir, "out", `tree-sitter-${grammar}.wasm`);
}

// src/verify/symbol-resolver.ts
var initialized = false;
var languageCache = /* @__PURE__ */ new Map();
async function loadLanguage(grammar) {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
  const cached = languageCache.get(grammar);
  if (cached) return cached;
  try {
    const lang = await Parser.Language.load(wasmPathFor(grammar));
    languageCache.set(grammar, lang);
    return lang;
  } catch {
    return void 0;
  }
}
async function collectDeclarations(source, path) {
  const grammar = grammarFor(path);
  if (!grammar) return void 0;
  const lang = await loadLanguage(grammar);
  if (!lang) return void 0;
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  const declarations = [];
  const stack = [{ node: tree.rootNode, ancestry: [] }];
  while (stack.length > 0) {
    const { node, ancestry } = stack.pop();
    const nameNode = node.childForFieldName("name");
    let childAncestry = ancestry;
    if (nameNode && nameNode.text) {
      declarations.push({
        name: nameNode.text,
        ancestry,
        range: { start: node.startPosition.row + 1, end: node.endPosition.row + 1 }
      });
      childAncestry = [...ancestry, nameNode.text];
    }
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const child = node.namedChild(i);
      if (child) stack.push({ node: child, ancestry: childAncestry });
    }
  }
  tree.delete();
  parser.delete();
  return declarations;
}
function splitSymbol(symbol) {
  return symbol.split(/::|\.|#/).filter(Boolean);
}
function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}
function matchSymbol(declarations, symbol, authoredRange) {
  const parts = splitSymbol(symbol);
  const target = parts[parts.length - 1];
  if (!target) return void 0;
  const qualifiers = parts.slice(0, -1);
  const candidates = declarations.filter((d) => d.name === target);
  if (candidates.length === 0) return void 0;
  const scored = candidates.map((d) => {
    let score = 0;
    if (qualifiers.length > 0 && qualifiers.every((q) => d.ancestry.includes(q))) score += 10;
    if (authoredRange && rangesOverlap(d.range, authoredRange)) score += 5;
    return { d, score };
  });
  scored.sort((a, b) => b.score - a.score || a.d.range.start - b.d.range.start);
  return scored[0].d;
}

// src/codemap/import-graph.ts
import { extname as extname2 } from "path";
var JS_TS = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
var PY = /* @__PURE__ */ new Set([".py"]);
var GO = /* @__PURE__ */ new Set([".go"]);
var JS_IMPORT = /(?:import\s[^'"]*?from\s*|import\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
var PY_FROM = /^\s*from\s+([\w.]+)\s+import/gm;
var PY_IMPORT = /^\s*import\s+([\w.]+)/gm;
var GO_IMPORT = /"([^"]+)"/g;
function extractImportSpecifiers(source, path) {
  const ext = extname2(path).toLowerCase();
  const found = /* @__PURE__ */ new Set();
  const push = (re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) if (m[1]) found.add(m[1]);
  };
  if (JS_TS.has(ext)) push(JS_IMPORT);
  else if (PY.has(ext)) {
    push(PY_FROM);
    push(PY_IMPORT);
  } else if (GO.has(ext)) {
    const block = source.match(/import\s*\(([\s\S]*?)\)/);
    if (block) {
      const re = new RegExp(GO_IMPORT);
      let m;
      while ((m = re.exec(block[1])) !== null) found.add(m[1]);
    }
    push(/import\s+"([^"]+)"/g);
  }
  return [...found];
}

// src/codemap/repo-map.ts
var JS_TS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
function resolveSpecifier(spec, fromPath, known) {
  if (!spec.startsWith(".")) return void 0;
  const base = normalize(join2(dirname2(fromPath), spec)).replace(/\\/g, "/");
  const candidates = [base, ...JS_TS_EXT.map((e) => base + e), ...JS_TS_EXT.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => known.has(c));
}
async function buildRepoMapFromFiles(sources) {
  const known = new Set(sources.keys());
  const files = [];
  const symbolIndex = /* @__PURE__ */ new Map();
  for (const [path, source] of sources) {
    const decls = await collectDeclarations(source, path) ?? [];
    const symbols = [...new Set(decls.filter((d) => d.ancestry.length === 0).map((d) => d.name))];
    const specifiers = extractImportSpecifiers(source, path);
    const imports = [...new Set(specifiers.map((s) => resolveSpecifier(s, path, known)).filter((p) => !!p))];
    files.push({ path, symbols, imports });
    for (const sym of symbols) {
      const arr = symbolIndex.get(sym) ?? [];
      arr.push(path);
      symbolIndex.set(sym, arr);
    }
  }
  return { files, symbolIndex };
}

// src/codemap/repo-map-loader.ts
import { readFile } from "fs/promises";
import { join as join5 } from "path";

// src/lib/analysis-config.ts
import { join as join4 } from "path";

// src/lib/config.ts
import { fileURLToPath } from "url";
import { dirname as dirname3, join as join3 } from "path";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname3(__filename);
var PACKAGE_ROOT = join3(__dirname, "..");
var KB_PROMPT_PATH = join3(PACKAGE_ROOT, "prompts", "KB-CREATION.md");
var SKILL_CREATION_PROMPT_PATH = join3(PACKAGE_ROOT, "prompts", "SKILL-CREATION.md");
var SKILL_CREATOR_REPO = "https://github.com/anthropics/skills.git";
var SKILL_CREATOR_SUBPATH = "skills/skill-creator";
var SKILL_CREATOR_INSTALL_DIR = ".claude/skills/skill-creator";
var DEFAULT_MODEL = process.env.FEATURES_MODEL || "sonnet";

// src/lib/analysis-config.ts
var ANALYSIS_DIR = ".features";
var ANALYSIS_FEATURES_DIR = join4(ANALYSIS_DIR, "features");
var SKILLS_DIR = join4(ANALYSIS_DIR, "skills");
var OVERVIEW_FILE = join4(ANALYSIS_DIR, "overview.md");
var INVENTORY_FILE = join4(ANALYSIS_FEATURES_DIR, "_inventory.json");
var MANIFEST_FILE = join4(ANALYSIS_DIR, "manifest.json");
var DEFAULT_SERVE_PORT = 4747;
var PROMPTS_DIR = join4(PACKAGE_ROOT, "prompts");
var INVENTORY_PROMPT_PATH = join4(PROMPTS_DIR, "INVENTORY.md");
var DEEPDIVE_PROMPT_PATH = join4(PROMPTS_DIR, "FEATURE-DEEPDIVE.md");
var FEATURE_SKILL_PROMPT_PATH = join4(PROMPTS_DIR, "FEATURE-SKILL.md");
var COMBINED_PROMPT_PATH = join4(PROMPTS_DIR, "FEATURE-COMBINED.md");
var VIEWER_DIST_DIR = join4(PACKAGE_ROOT, "viewer-dist");
var DEFAULT_IGNORE_DIRS = [
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  ".git",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".gradle",
  "Pods",
  "coverage",
  ".idea",
  ".vscode",
  ".features"
];

// src/codemap/repo-map-loader.ts
var MAX_FILE_BYTES = 256 * 1024;
function isIgnored(path) {
  return DEFAULT_IGNORE_DIRS.some((d) => path === d || path.startsWith(`${d}/`) || path.includes(`/${d}/`));
}
async function buildRepoMap(root, trackedFiles) {
  const sources = /* @__PURE__ */ new Map();
  for (const rel of trackedFiles) {
    if (isIgnored(rel)) continue;
    if (!grammarFor(rel)) continue;
    try {
      const buf = await readFile(join5(root, rel));
      if (buf.byteLength > MAX_FILE_BYTES) continue;
      sources.set(rel.replace(/\\/g, "/"), buf.toString("utf-8"));
    } catch {
    }
  }
  return buildRepoMapFromFiles(sources);
}

// src/codemap/feature-match.ts
var STOP = /* @__PURE__ */ new Set(["the", "a", "an", "and", "or", "of", "to", "for", "with", "in", "on", "is", "are", "be", "this", "that"]);
function tokenize(s) {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}
function symbolWords(sym) {
  return sym.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^a-zA-Z0-9]+/).map((w) => w.toLowerCase()).filter(Boolean);
}
function candidateFiles(feature, map, limit) {
  const terms = /* @__PURE__ */ new Set([...tokenize(feature.name), ...tokenize(feature.summary), ...tokenize(feature.id), ...tokenize(feature.area)]);
  if (terms.size === 0) return [];
  const scored = map.files.map((f) => {
    let score = 0;
    const pathWords = new Set(symbolWords(f.path));
    for (const t of terms) if (pathWords.has(t)) score += 3;
    for (const sym of f.symbols) {
      const words = new Set(symbolWords(sym));
      for (const t of terms) if (words.has(t)) score += 2;
    }
    return { path: f.path, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, limit).map((s) => s.path);
}

export {
  KB_PROMPT_PATH,
  SKILL_CREATION_PROMPT_PATH,
  SKILL_CREATOR_REPO,
  SKILL_CREATOR_SUBPATH,
  SKILL_CREATOR_INSTALL_DIR,
  DEFAULT_MODEL,
  grammarFor,
  langTagFor,
  wasmPathFor,
  collectDeclarations,
  splitSymbol,
  matchSymbol,
  extractImportSpecifiers,
  buildRepoMapFromFiles,
  ANALYSIS_DIR,
  ANALYSIS_FEATURES_DIR,
  SKILLS_DIR,
  OVERVIEW_FILE,
  INVENTORY_FILE,
  MANIFEST_FILE,
  DEFAULT_SERVE_PORT,
  INVENTORY_PROMPT_PATH,
  DEEPDIVE_PROMPT_PATH,
  FEATURE_SKILL_PROMPT_PATH,
  COMBINED_PROMPT_PATH,
  VIEWER_DIST_DIR,
  buildRepoMap,
  candidateFiles
};
