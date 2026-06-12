---
date: 2026-06-12
topic: data-flow-payload-preview
---

# Requirements: Data Flow and Payload Preview

## Summary

Build a Data Preview surface in Options that explains what tldr stores, sends, and does not send. The surface serves both users and Chrome Web Store reviewers by pairing a stable data-flow explanation with a real preview for the current tab and the destinations currently enabled.

---

## Problem Frame

tldr's core value depends on handling sensitive browser data: URLs, page titles, domains, readable page text, tags, API keys, and third-party tokens. The extension has a strong local-first story, but that story can become misleading if users configure a cloud LLM, Pinboard, Readwise, or GoodLinks and cannot see what leaves the browser.

Chrome Web Store review also needs the same clarity. The store submission must explain the extension's single purpose, permission reasons, user-data handling, remote API use, and reviewer test path. A product-visible Data Preview can become the source of truth for user trust, screenshots, privacy copy, and reviewer notes.

---

## Key Decisions

- **One surface for users and reviewers.** The Options page should contain a visible trust surface that ordinary users can inspect and reviewers can use as evidence, rather than maintaining separate reviewer-only language.
- **Low-friction preview.** The preview should be available before saving, but it should not introduce a mandatory confirmation step in v1.
- **Folded sensitive content.** Field names, destinations, privacy mode, and character counts should be visible by default; real page excerpt text should be expandable.
- **Dynamic destinations.** The preview should reflect configured or selected destinations so disabled integrations are represented honestly as not receiving data.
- **Options first, popup later.** The existing Options page remains the launch surface for this work; an action popup is deferred.

---

## Actors

- A1. **User:** Configures privacy mode, LLM endpoint, and integrations; may inspect what will leave the browser before saving.
- A2. **Chrome Web Store reviewer:** Verifies that the extension's user-data behavior matches its declared purpose and privacy disclosures.
- A3. **External destination:** A user-configured LLM endpoint, Pinboard, Readwise, or GoodLinks destination that may receive user-directed data.

---

## Requirements

**Data-flow explanation**

- R1. The Options UI explains that tldr has no backend and that data leaves the browser only through user-configured LLM or integration flows.
- R2. The Options UI lists the main data classes tldr handles: page title, URL, domain, readable text or excerpt, tags, saved items, settings, API keys, Pinboard token, and Readwise token.
- R3. The Options UI distinguishes local storage, Chrome sync storage, and external destinations in language a non-developer can understand.
- R4. The Options UI states that API keys and integration tokens are not sent to the LLM payload preview destination.
- R5. The explanation covers all privacy modes: title only, title plus excerpt, and readable text truncated to the configured character limit.

**Current-tab payload preview**

- R6. The Options UI provides a preview for the current active tab that shows the LLM-bound fields implied by the selected privacy mode.
- R7. The current-tab preview shows field presence and character counts by default, with actual excerpt text hidden until the user expands it.
- R8. The current-tab preview shows the configured LLM host when LLM tagging is enabled or configured.
- R9. The current-tab preview makes clear when no LLM endpoint is configured or when no content will be sent to an LLM.
- R10. The preview does not block normal saving or tagging in v1.

**Dynamic destinations**

- R11. The preview shows Pinboard only when the current settings make Pinboard a possible destination for a save or sync action.
- R12. The preview shows Readwise only when Readwise export is enabled or selected for the relevant action.
- R13. The preview shows GoodLinks only when GoodLinks export is enabled or selected for the relevant action.
- R14. For every shown destination, the preview lists the categories of data that destination would receive.
- R15. For disabled or unconfigured integrations, the UI should make the "not sent there" state clear enough that users do not infer hidden sharing.

**Reviewer and listing support**

- R16. The Data Preview surface should be suitable for Chrome Web Store screenshots without exposing real secrets.
- R17. The feature should support reviewer notes by making the extension's remote API behavior distinguishable from remotely hosted executable code.
- R18. The feature should produce or support copy that can be reused in the privacy policy and Chrome Web Store data-use disclosures.

---

## Key Flows

- F1. **Inspect fixed data-flow explanation**
  - **Trigger:** A user or reviewer opens Options.
  - **Actors:** A1, A2
  - **Steps:** The page explains local storage, sync storage, LLM transfer, and optional integration transfers.
  - **Outcome:** The reader can describe what tldr stores locally and what may leave the browser.
  - **Covers:** R1, R2, R3, R4, R5

- F2. **Preview current-tab LLM payload**
  - **Trigger:** A user wants to save and tag the current tab from Options.
  - **Actors:** A1
  - **Steps:** The preview reads the current tab context, applies the selected privacy mode, and shows fields plus character counts before the action proceeds.
  - **Outcome:** The user can inspect the LLM-bound payload without being forced through a modal confirmation.
  - **Covers:** R6, R7, R8, R9, R10

- F3. **Inspect dynamic destinations**
  - **Trigger:** A user has configured or selected integrations.
  - **Actors:** A1, A3
  - **Steps:** The preview lists each active destination and the categories of data it would receive.
  - **Outcome:** Disabled integrations are clearly not recipients, and enabled destinations are visible before data transfer.
  - **Covers:** R11, R12, R13, R14, R15

---

## Acceptance Examples

- AE1. **Title-only mode avoids excerpt text**
  - **Covers:** R5, R6, R7
  - **Given:** Privacy mode is title only.
  - **When:** The user opens the current-tab preview.
  - **Then:** The preview shows title, URL, domain, and tag context, and it does not include page excerpt text.

- AE2. **Excerpt mode hides content by default**
  - **Covers:** R5, R7
  - **Given:** Privacy mode includes an excerpt.
  - **When:** The user opens the current-tab preview.
  - **Then:** The preview shows that excerpt content would be sent and displays the character count by default, with actual excerpt text available only after expansion.

- AE3. **No LLM endpoint is configured**
  - **Covers:** R8, R9
  - **Given:** The user has not configured an LLM endpoint.
  - **When:** The user views the Data Preview.
  - **Then:** The UI says no LLM destination is configured and does not imply that tagging data will be sent to a hidden default provider.

- AE4. **Integration is disabled**
  - **Covers:** R11, R12, R13, R15
  - **Given:** Readwise is not configured or selected.
  - **When:** The user views destinations.
  - **Then:** Readwise is represented as not receiving data, not omitted in a way that suggests the list may be incomplete.

- AE5. **Screenshot-safe state**
  - **Covers:** R16
  - **Given:** A developer prepares Chrome Web Store screenshots.
  - **When:** The Data Preview is shown with example or redacted data.
  - **Then:** The screenshot can communicate data flow without exposing API keys, tokens, or private page content by default.

---

## Success Criteria

- A privacy-conscious user can tell which destinations receive page-derived data before using LLM tagging or integrations.
- A Chrome Web Store reviewer can map the UI's data-flow explanation to the store privacy disclosures without needing private tokens.
- The store listing can include at least one screenshot of the Data Preview without exposing sensitive user content.
- The feature does not add a mandatory confirmation step to the normal save flow.

---

## Scope Boundaries

### Deferred for later

- Action popup with Save, Preview, and Settings.
- Full per-item provenance history.
- Local diagnostic flight recorder for save and sync failures.
- Complete sync-state model with queued, retrying, failed, and synced statuses.

### Outside this feature

- Scheduled reports, idea lab, digests, or broader thinking-partner roadmap work.
- Any tldr-hosted backend or telemetry service.
- Changing Chrome Web Store copy directly; this feature supplies the product truth that copy should reference.

---

## Dependencies and Assumptions

- The Options page remains the first launch surface for reviewer-visible trust work.
- The extension can access enough current-tab context from Options to create a useful preview, or planning will define an equivalent current-tab preview path.
- Pinboard's current automatic sync behavior must be made explicit in the preview before implementation proceeds.
- The privacy policy and Chrome Web Store submission should reuse the same data classes and destination language as this feature.

---

## Sources and Research

- `README.md` for current product positioning and release ritual.
- `static/manifest.json` for declared permissions and host permissions.
- `src/background/llm.ts` for LLM-bound data categories.
- `src/background/pipeline.ts` for privacy-mode behavior and Pinboard sync behavior.
- `src/common/storage.ts` for local and sync storage behavior.
- Chrome Web Store docs for publishing, privacy fields, user data policy, and single-purpose requirements:
  - https://developer.chrome.com/docs/webstore/publish
  - https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
  - https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
  - https://developer.chrome.com/docs/webstore/program-policies/privacy
  - https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines
