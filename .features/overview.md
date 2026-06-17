---
name: michael-elkabetz/features
tagline: A CLI tool that teaches code agents about your codebase once, so they stop re-learning it on every task.
language: TypeScript + Commander.js
specVersion: 1
analyzedAt: 7a7e0fa
---

## Description

Features is a developer tool that solves a recurring problem with AI code agents: every time you give an agent a task, it re-scans your entire codebase to understand it — burning tokens and producing inconsistent results. Features fixes this by letting you analyze your repository once and produce structured "knowledge files" and "skills" for each area of your code. When the agent works on a task, it gets a small, precise context slice instead of scanning everything from scratch.

The tool ships as an npm CLI (`features`) and includes a local web viewer for browsing the generated knowledge. It uses Claude (via the Anthropic API) to analyze codebases, generate knowledge documents, and implement changes using that stored knowledge. The workflow follows a Kabbalistic metaphor: Chochmah (wisdom/knowledge files), Binah (planning/skills), and Da'at (execution/implementation).

## Areas

```area
id: user-interfaces
name: User Interfaces
icon: layers
kind: technical
blurb: The delivery surfaces — CLI and web viewer — through which developers interact with Features.
```

```area
id: codebase-intelligence
name: Codebase Intelligence
icon: search
kind: business
blurb: Analyzes repositories to discover features, map code structure, and generate a browsable knowledge base.
```

```area
id: knowledge-authoring
name: Knowledge Authoring
icon: sparkle
kind: business
blurb: Creates and manages per-feature knowledge files and skills that give code agents precise, reusable context.
```

```area
id: ai-assisted-implementation
name: AI-Assisted Implementation
icon: zap
kind: business
blurb: Uses stored feature knowledge to implement code changes via Claude, skipping the re-learning phase.
```

```area
id: data-pipeline
name: Data Pipeline
icon: workflow
kind: technical
blurb: The compile-and-validate pipeline that turns raw markdown knowledge into a verified, deployable manifest.
```
