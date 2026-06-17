---
id: web-viewer
area: user-interfaces
name: Web Viewer
summary: A local web UI served on port 4747 that lets developers browse generated feature knowledge, with an optional live mode for triggering analysis from the browser.
kind: technical
status: stable
complexity: complex
related: [cli, manifest-compilation, repository-analysis]
specVersion: 1
analyzedAt: 7a7e0fa
---

## In a nutshell

The Web Viewer is a single-page application that runs locally in your browser so you can explore the feature knowledge that the CLI generates. When you run `features serve`, a lightweight HTTP server starts on port 4747, serves a pre-built JavaScript app, and feeds it the compiled `manifest.json` that describes every area and feature in the repo.

There are two server modes. The default "static" mode (powered by Node's built-in `http` module) simply serves files and the manifest — no external dependencies needed. The "live" mode (`features serve --live`) swaps in a richer server built on the Hono framework. Live mode adds a small REST API that lets you kick off a full or single-feature analysis directly from the browser and stream its progress back in real time using Server-Sent Events (SSE — a browser-native way to receive a stream of updates from the server over a single HTTP connection).

## How it works

1. The developer runs `features serve` (or `features serve --live`) from the CLI.
2. The command handler picks the static `ServeService` or the live `LiveServerService` based on the `--live` flag.
3. The chosen service creates an HTTP server on port 4747 (configurable with `--port`) and serves the bundled viewer app from the `viewer-dist` directory.
4. The browser app fetches `/manifest.json` on load and builds an in-memory index of areas, features, and search items.
5. The user navigates between an overview dashboard, area pages, and individual feature detail pages — all client-side routed inside the single-page app.
6. In live mode, the app also polls `/api/status` to detect live capabilities, and shows a "Live Analysis" panel where the user can click "Run Analysis" to POST to `/api/analyze` and watch progress via an SSE stream at `/api/analyze/events`.

## Flow

1. CLI command — `features serve [--live]`
2. Server starts — static HTTP or Hono server on port 4747
3. Browser loads SPA — fetches `manifest.json`, builds repo index
4. Client-side routing — overview, area, and feature views rendered
5. Live analysis (optional) — POST triggers analysis, SSE streams progress back

## Code references

```ref
path: src/commands/serve.ts
lines: 19-38
symbol: makeServeCommand
what: CLI command handler that decides between static and live mode and starts the server
note: The "live" flag selects between "ServeService" (static) and "LiveServerService" (live).
sha: 7a7e0fa
```

```ref
path: src/services/serve.service.ts
lines: 22-102
symbol: ServeService
what: Static-mode HTTP server using Node's built-in http module — serves viewer assets and the manifest
note: Handles SPA fallback routing and a small "/api/doc" endpoint for reading raw markdown files. No external framework needed.
sha: 7a7e0fa
```

```ref
path: src/services/live-server.service.ts
lines: 24-185
symbol: LiveServerService
what: Live-mode server built on Hono — adds REST endpoints and SSE streaming for browser-triggered analysis
note: The "/api/analyze" endpoint fires analysis in the background; "/api/analyze/events" streams progress via SSE. Edits to feature docs are validated by recompiling the manifest before accepting.
sha: 7a7e0fa
```

```ref
path: src/lib/analysis-config.ts
lines: 11-18
symbol: DEFAULT_SERVE_PORT
what: Defines the default port (4747) and the path to the bundled viewer assets
sha: 7a7e0fa
```

```ref
path: viewer-dist/assets/raise-app.js
lines: 1-14
symbol: app
what: The bundled single-page application — client-side state, routing, search, and rendering for the web viewer
note: A vanilla-JS SPA with no framework. State variables like "repo", "route", "liveState", and "searchOpen" drive the entire UI.
sha: 7a7e0fa
```

```ref
path: viewer-dist/assets/raise-app.js
lines: 708-753
symbol: checkLiveStatus
what: Live-mode client logic — detects live capability, connects to SSE event stream, and triggers analysis
note: "connectEvents" opens an EventSource to "/api/analyze/events"; "startAnalysis" POSTs to "/api/analyze". On "done", the manifest is reloaded automatically.
sha: 7a7e0fa
```

## Related

- [CLI](cli.md)
- [Manifest compilation](manifest-compilation.md)
- [Repository analysis](repository-analysis.md)
