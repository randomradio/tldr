---
date: 2026-06-12
topic: chrome-web-store-launch-readiness
focus: publish the tldr Chrome extension to the Chrome Web Store
mode: repo-grounded
---

# Ideation: Chrome Web Store Launch Readiness

## Grounding Context

tldr is a Manifest V3 Chrome extension for saving the current page, extracting readable content, tagging saved links through a user-configured OpenAI-compatible LLM endpoint, and syncing/exporting through Pinboard, GoodLinks, and Readwise.

The current README frames a broad "thinking partner" vision, while the current shipped code is narrower: save current tab, extract page content, generate tags, store items locally, and optionally sync/export. The manifest requests `storage`, `activeTab`, `scripting`, `notifications`, `alarms`, `contextMenus`, Pinboard/Readwise host permissions, and optional all-site host permissions.

The code sends title, URL, domain, known tags, and privacy-mode-limited excerpts to the configured LLM host. Settings are stored in Chrome sync storage; secrets and saved items are stored in Chrome local storage. A build/package flow exists, but local `pnpm build` currently fails until pnpm approves the `esbuild` build script.

Chrome Web Store review requires a narrow single purpose, permission justifications, privacy/data-use disclosures, a remote-code declaration, privacy policy coverage, distribution settings, and test instructions. Chrome's policy treats website content, URLs/browsing activity, authentication information, and user-provided content as sensitive data.

## Topic Axes

- Store-review compliance
- Privacy/trust
- Install/onboarding UX
- Reliability/release pipeline
- Market/listing positioning

## Ranked Ideas

### 1. Single-Purpose Spine

**Description:** Write one canonical purpose sentence and reuse it across `manifest.description`, Chrome Web Store single-purpose copy, the listing, privacy policy, first-run UI, screenshots, and reviewer notes. Frame v0.1 around saving the current page, extracting readable content, and organizing it with user-controlled AI tags and exports.

**Axis:** Store-review compliance / market-listing positioning

**Basis:** `direct:` `README.md` describes a broad "thinking partner" vision, while `static/manifest.json` is narrower: save links, extract content, tag with LLM, sync to Pinboard. `external:` Chrome Web Store guidance requires a narrow single purpose and privacy-purpose declaration.

**Rationale:** One sentence becomes the root artifact for review, copy, screenshots, privacy disclosures, and future feature triage.

**Downsides:** It temporarily deemphasizes scheduled reports, idea generation, and the larger thinking-partner vision.

**Confidence:** 92%

**Complexity:** Low

**Status:** Unexplored

### 2. Data-Flow Ledger + Payload Preview

**Description:** Create a versioned "what data goes where" matrix for URL, title, domain, excerpt/readable text, tags, LLM API key, Pinboard token, Readwise token, settings, and saved items. In the Options UI, show the exact outbound payload implied by the selected privacy mode before the first LLM call.

**Axis:** Privacy/trust

**Basis:** `direct:` `src/background/llm.ts` sends title, URL, domain, excerpt, and known tags to the configured LLM; `src/common/storage.ts` stores settings in sync storage and secrets/items locally. `external:` Chrome treats website content, browsing activity, auth info, and user-provided content as sensitive data requiring disclosure and secure handling.

**Rationale:** A single ledger compounds into privacy policy copy, CWS data-use answers, in-app trust UI, reviewer notes, screenshots, and regression checks.

**Downsides:** It adds explanatory UI that must stay concise and accurate.

**Confidence:** 95%

**Complexity:** Medium

**Status:** Explored

### 3. Permission Ladder

**Description:** Turn permissions into a visible feature-by-feature ladder: active-tab save, current-page origin access, configured LLM origin, and optional integrations. Each step should explain what is accessed, why, and how the user can revoke or avoid it.

**Axis:** Install/onboarding UX

**Basis:** `direct:` `static/manifest.json` includes `activeTab`, `scripting`, integration host permissions, and optional all-site host permissions; `src/ui/options.ts` already requests LLM and current-tab origin permissions at use time. `external:` Chrome expects minimum permissions tied to user-facing functionality.

**Rationale:** The ladder improves install confidence, reduces review ambiguity, and creates trust-focused listing material.

**Downsides:** It likely requires UI restructuring rather than copy-only edits.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 4. Local-First First Run

**Description:** Let users complete a useful save locally before configuring any LLM endpoint or third-party token. LLM tagging, Pinboard, GoodLinks, and Readwise become explicit enhancements rather than prerequisites for first value.

**Axis:** Privacy/trust / install-onboarding UX

**Basis:** `direct:` `src/common/storage.ts` currently defaults to a cloud LLM endpoint and `title_excerpt` privacy mode; README claims local-first/no-backend behavior. `reasoned:` A no-network first success better supports local-first trust and review clarity.

**Rationale:** "Nothing leaves your browser until you configure it" is a strong user and reviewer trust posture.

**Downsides:** It weakens the first-run AI moment unless the upgrade path is clear.

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 5. Reviewer Mode + Submission Evidence Packet

**Description:** Prepare a reviewer-friendly route with sample local items, a no-token demo path, privacy-mode toggles, optional integration instructions, a single-purpose statement, permission table, data-flow table, remote-code explanation, privacy answers, and test instructions.

**Axis:** Store-review compliance

**Basis:** `external:` Chrome publishing requires listing, privacy, distribution, and test-instruction surfaces. `direct:` Current behavior depends on user-configured LLM and optional service tokens.

**Rationale:** Reviewers should be able to verify the core product without personal third-party accounts or ambiguous setup.

**Downsides:** Demo behavior must remain clearly separate from normal production behavior.

**Confidence:** 86%

**Complexity:** Medium

**Status:** Unexplored

### 6. CWS Preflight Release Gate

**Description:** Extend packaging into a release gate that checks build success, manifest version sync, ZIP root manifest, sourcemap exclusion, permission inventory, host permission inventory, icon/screenshot presence, privacy policy readiness, reviewer notes, and the local pnpm/esbuild approval blocker.

**Axis:** Reliability/release pipeline

**Basis:** `direct:` `scripts/build.mjs` syncs manifest version; `scripts/package.mjs` zips `dist` and excludes source maps; local build currently fails on pnpm's ignored `esbuild` build scripts. `external:` Chrome Web Store upload requires a valid extension ZIP.

**Rationale:** The gate catches package and disclosure drift before upload.

**Downsides:** It mostly improves release confidence rather than end-user value.

**Confidence:** 84%

**Complexity:** Low-Medium

**Status:** Unexplored

### 7. Trust-First Listing Asset Kit

**Description:** Convert existing assets and screenshots into a store-listing kit that proves the trust model: current-page save, privacy mode, outbound payload preview, LLM endpoint configuration, integration toggles, local save result, and sync/export status.

**Axis:** Market/listing positioning

**Basis:** `direct:` `assets/` and `screenshots/` already contain listing material. `external:` Store listing metadata and privacy disclosures must match actual extension behavior.

**Rationale:** Screenshots can answer "what does it do?" and "what leaves my browser?" before install.

**Downsides:** The best screenshots depend on first building the trust UI.

**Confidence:** 80%

**Complexity:** Low after trust UI exists

**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Remote Endpoint Trust Inspector | Folded into Data-Flow Ledger + Payload Preview. |
| 2 | Remove Silent Sync | Folded into Local-First First Run. |
| 3 | Flight Recorder | Useful, but less urgent than preflight and reviewer mode before first submission. |
| 4 | Provenance Labels | Useful later; too much surface for first launch-readiness pass. |
| 5 | Million-User Sync States | Better as second-wave reliability work after explicit sync/export decisions. |
| 6 | Permission Diet Release | Folded into Permission Ladder; exact permission removals need implementation planning. |
| 7 | Feature-Roadmap Firewall | Folded into Single-Purpose Spine. |
| 8 | All-Cloud Honesty Mode | Folded into the privacy/data ledger. |
