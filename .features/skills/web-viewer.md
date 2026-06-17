# Web Viewer Implementation Skill

## MANDATORY — Read Before Doing Anything

Before taking ANY action, you MUST:

1. Read the knowledge file at `.features/features/web-viewer.md`
2. Use ONLY the behavior, code references, flow, and constraints described in that file
3. Do NOT explore, scan, or investigate the codebase to understand this feature — the knowledge file already contains what you need
4. Do NOT use broad Glob, Grep, repo-wide search, or exploratory subagents to discover patterns or architecture
5. ONLY read specific files when you need to edit them, verify exact lines, or the knowledge file tells you to reference them

## Feature Summary

- The developer runs features serve (or features serve --live) from the CLI.
- The command handler picks the static ServeService or the live LiveServerService based on the --live flag.
- The chosen service creates an HTTP server on port 4747 (configurable with --port) and serves the bundled viewer app from the viewer-dist directory.
- The browser app fetches /manifest.json on load and builds an in-memory index of areas, features, and search items.
- The user navigates between an overview dashboard, area pages, and individual feature detail pages — all client-side routed inside the single-page app.

## Known Files

- `src/commands/serve.ts` — `makeServeCommand`: CLI command handler that decides between static and live mode and starts the server
- `src/services/serve.service.ts` — `ServeService`: Static-mode HTTP server using Node's built-in http module — serves viewer assets and the manifest
- `src/services/live-server.service.ts` — `LiveServerService`: Live-mode server built on Hono — adds REST endpoints and SSE streaming for browser-triggered analysis
- `src/lib/analysis-config.ts` — `DEFAULT_SERVE_PORT`: Defines the default port (4747) and the path to the bundled viewer assets
- `viewer-dist/assets/raise-app.js` — `app`: The bundled single-page application — client-side state, routing, search, and rendering for the web viewer
- `viewer-dist/assets/raise-app.js` — `checkLiveStatus`: Live-mode client logic — detects live capability, connects to SSE event stream, and triggers analysis

## Implementation Steps

1. Read `.features/features/web-viewer.md` and locate the code references above.
2. Make the smallest change that satisfies the request, editing only the files listed unless the knowledge file points elsewhere.
3. Preserve the existing flow described in the knowledge file: CLI command → Server starts → Browser loads SPA → Client-side routing → Live analysis (optional).
4. Re-read any file immediately before editing it to confirm current line numbers.

## Validation

- Run the narrowest relevant check for the files you touched (the closest unit test, type check, or linter).
- If no obvious check exists, build the project and exercise the feature's entry point.

## Do Not

- Do NOT introduce new dependencies or abstractions not already present in the listed files.
- Do NOT refactor unrelated code.
- Do NOT widen the change beyond what the request and knowledge file require.

## Final Step: Knowledge Sync

After your code change, update the feature knowledge file at `.features/features/web-viewer.md` (and this skill) so the code references, line ranges, flow, and summary still match reality. Stale knowledge is worse than none.
