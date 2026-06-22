---
title: "feat: Pinboard and Readwise capture with subtle page status"
type: feat
status: completed
date: 2026-06-22
origin: docs/product/2026-06-22-pinboard-readwise-capture-flow.md
---

# feat: Pinboard and Readwise capture with subtle page status

## Summary

Turn the current one-click save flow into a capture bridge: extract the active page, generate tags from existing Pinboard context, save/update Pinboard, optionally save/update Readwise Reader, and show a subtle top-of-page status UI with quick actions.

This plan intentionally separates the operational capture UI from the Options-page Data Preview. Data Preview remains the privacy/reviewer surface; the top-page UI is lightweight feedback after a user action.

## Confirmed API Facts

Readwise Reader API documentation confirms:

- `POST https://readwise.io/api/v3/save/` creates a Reader document.
- The save payload supports `url`, `title`, `summary`, `tags`, `location`, `category`, and `saved_using`.
- Save returns `201`, or `200` if the document already exists.
- `PATCH https://readwise.io/api/v3/update/<document_id>/` updates a Reader document, including replacing `tags`.
- `GET https://readwise.io/api/v3/tags/` lists Reader document tags.

Source: https://readwise.io/reader_api

## Requirements

- R1. Capture starts from an explicit user action: extension action, Options action, context menu, or future shortcut.
- R2. Capture extracts URL, title, domain, and readable text/description according to the configured privacy mode.
- R3. Tag generation prefers known Pinboard tags and creates new tags only when needed.
- R4. Pinboard save/update receives URL, title, short description/excerpt, tags, and configured `shared` / `toread` flags.
- R5. Readwise Reader save/update receives URL, title, summary/description, tags, and `saved_using: "tldr"` when enabled.
- R6. Readwise capture is controlled by an explicit setting, not merely by token presence.
- R7. Capture result distinguishes partial success: LLM, local item, Pinboard, and Readwise can each succeed or fail independently.
- R8. A subtle top-of-page UI appears after capture, showing status, tags, and compact actions.
- R9. The top-page UI must not reveal tokens or hidden excerpt text.
- R10. Existing Options export behavior keeps working.
- R11. Existing Data Preview updates to show Readwise as a capture destination only when the new setting is enabled.
- R12. Re-capturing the same URL must not create duplicate local items or repeat Pinboard/Readwise writes when the synced payload has not changed.

## Key Technical Decisions

- **Use an explicit Readwise capture toggle:** Add a `readwise.saveOnCapture` setting. This avoids surprising writes for users who configured Readwise only for manual export.
- **Keep export and capture clients shared:** Move Readwise API calls into a dedicated client module so Options export and capture use the same endpoint, auth, and response handling.
- **Preserve existing item return shape where possible:** Keep `tagAndMaybeSync` available for callers that expect an `Item`, but add a richer capture orchestrator for destination results.
- **Inject page UI after capture:** Use `chrome.scripting.executeScript` after a successful user-initiated capture to render the subtle UI. Do not register a persistent content script for v1 unless injection proves unreliable.
- **Treat Reader existing-document response as success:** `POST /save/` returning `200` should be shown as saved/updated rather than failed.
- **Use URL and sync fingerprints for idempotency:** Reuse an existing local item for the same URL, reuse existing tags when the extracted payload is unchanged, and skip Pinboard/Readwise calls when the destination already has the same URL/title/excerpt/tags fingerprint.

## Implementation Units

### U1. Shared capture result model

- **Goal:** Add a serializable model for capture inputs, destination results, and UI summaries.
- **Files:** `src/common/capture.ts`, `src/common/types.ts`
- **Approach:** Define destination result statuses such as `success`, `skipped`, and `error`; include safe fields for title, URL, tags, Pinboard status, Readwise status, and Reader URL.
- **Verification:** Type-checking and focused tests for status summarization if pure helper logic is added.

### U2. Readwise Reader client

- **Goal:** Centralize Reader save/update behavior and reuse it from export and capture.
- **Files:** `src/background/readwise.ts`, `src/background/exporters.ts`, `src/background/readwise.test.ts`
- **Approach:** Add a pure body builder plus an async client using `POST https://readwise.io/api/v3/save/`. Include `tags`, `summary`, and `saved_using: "tldr"`. Treat HTTP 200 and 201 as success.
- **Verification:** Unit tests cover request body construction, tag inclusion, optional summary, and endpoint path with trailing slash.

### U3. Capture orchestrator

- **Goal:** Run extraction, tagging, local item write, Pinboard sync, and optional Readwise sync as one capture result.
- **Files:** `src/background/pipeline.ts`, `src/background/index.ts`, `src/common/storage.ts`
- **Approach:** Add a richer `captureAndSync` function that keeps the existing privacy excerpt selection and known-tag logic. Preserve `tagAndMaybeSync` as a compatibility wrapper returning `Item`.
- **Verification:** Unit or integration-style tests around partial destination failure if Chrome APIs can be avoided; otherwise verify with type-check, build, and manual capture.

### U4. Readwise capture setting in Options

- **Goal:** Let the user opt into saving new captures to Readwise Reader.
- **Files:** `src/common/types.ts`, `src/common/storage.ts`, `static/options.html`, `static/options.css`, `src/ui/options.ts`, `src/common/preview.ts`, `src/common/preview.test.ts`
- **Approach:** Extend `Settings.readwise` with `saveOnCapture?: boolean`, default `false`. Render a checkbox or select near the Readwise token field. Update Data Preview destination logic to show capture Readwise only when both token and setting are present.
- **Verification:** Preview tests cover Readwise disabled, selected for export, and enabled for capture.

### U5. Subtle top-of-page status UI

- **Goal:** Show capture feedback on the page after the user saves the current tab.
- **Files:** `src/background/index.ts`, `src/content/captureStatus.ts` or injected function in `src/background/index.ts`, `scripts/build.mjs` if a new content entry is bundled
- **Approach:** Render a compact fixed top bar with capture status, tags, destination chips, dismiss, open Reader, and open Pinboard when URLs are available. Keep text and controls small, quiet, and screenshot-safe.
- **Verification:** Build succeeds; manual test on an ordinary HTTP page confirms the UI appears, does not block page content heavily, can dismiss, and does not appear on inaccessible pages.

### U6. Release and reviewer updates

- **Goal:** Keep Chrome Web Store claims aligned with the new capture behavior.
- **Files:** `README.md`, `docs/release/chrome-web-store-publishing-checklist.md`, `docs/product/2026-06-22-pinboard-readwise-capture-flow.md`
- **Approach:** Update permission rationale and privacy copy to mention optional Readwise capture on save.
- **Verification:** Package ZIP still has `manifest.json` at root and excludes source maps.

## Scope Boundaries

- Do not build a full item history timeline.
- Do not add a persistent sidebar or popup redesign in this plan.
- Do not automatically enable Readwise capture solely because a token exists.
- Do not implement Readwise webhooks.
- Do not build tag editing autocomplete in the top-page UI beyond a compact first-pass affordance unless the implementation remains small.

## Test Plan

- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm build`
- `pnpm package`
- Manual Chrome test:
  - Load `dist/`.
  - Configure Pinboard and Readwise tokens.
  - Enable Readwise capture setting.
  - Capture a normal page.
  - Confirm Pinboard saved.
  - Confirm Reader document created or existing document accepted.
  - Confirm top-page UI appears and can dismiss.
- Disable Readwise capture and confirm capture skips Reader even with token present.
  - Capture the same unchanged URL twice and confirm the second run reports already saved/synced instead of creating duplicate local or external writes.

## Open Questions

- Should top-page tag editing be inline in v1, or should it deep-link to Options/item details later?
- Should Readwise capture default to `location: "new"` or defer to the user's Reader default location?
- Should Pinboard description prefer extracted excerpt, meta description, or a future user-authored note?
- Should the action badge remain, or should the top-page UI fully replace success/failure feedback?
