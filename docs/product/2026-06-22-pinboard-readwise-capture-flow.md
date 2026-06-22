# Pinboard and Readwise Capture Flow

Date: 2026-06-22

## User Clarification

The desired product is not primarily a generic page summarizer. The target workflow is:

1. Use Pinboard to capture a URL, including available description metadata.
2. Use the Readwise Reader API to capture or mirror the same item into Readwise Reader.
3. Automatically tag the item with existing tags when appropriate, or create new tags when needed.
4. After adding, show a very subtle UI at the top of the current page for confirmation and quick actions.

Reference screenshot from the user:

- `/Users/randomradio/Desktop/Screenshot 2026-06-22 at 11.02.13.png`
- Notable pattern: a quiet top-page bar, visually close to browser or Reader chrome, with low visual weight and compact action affordances.

## Product Intent

tldr should become a capture bridge across the user's reading systems:

- Pinboard remains the durable bookmark and URL capture layer.
- Readwise Reader becomes the read-it-later destination.
- The extension adds tag intelligence and page-local feedback.
- The user should see that the capture succeeded without being interrupted by a modal or heavy dashboard.

## Capture Inputs

The capture flow should collect:

- Current page URL.
- Page title.
- Domain.
- Pinboard-style description or extended description when available.
- Readable page excerpt or full extracted text, according to privacy mode.
- Existing tag corpus from Pinboard.
- Optional current Readwise Reader state if the API can identify an existing document by URL.

## Tagging Behavior

The tagger should:

- Prefer existing Pinboard tags when semantically close.
- Create new tags only when existing tags do not fit.
- Avoid near-duplicates.
- Return a small candidate set with confidence or rationale.
- Apply tags consistently to Pinboard and Readwise Reader when both destinations are active.

Open decision:

- Whether new tags are applied immediately or shown first in the subtle top-page UI for quick accept/edit.

## Destination Behavior

### Pinboard

- Save or update the URL.
- Include title.
- Include description or excerpt.
- Apply generated tags.
- Preserve configured `shared` and `toread` settings.

### Readwise Reader

- Create or update the Reader document through the Readwise API.
- Include URL and title.
- Include summary/description if supported by the API endpoint.
- Apply generated tags when supported.
- Avoid duplicate Reader documents for the same URL when possible.

Confirmed API notes:

- Reader document create is `POST https://readwise.io/api/v3/save/`.
- The create payload supports `url`, `title`, `summary`, `tags`, `location`, `category`, `saved_using`, and related metadata.
- The create endpoint returns `201`, or `200` when the document already exists.
- Reader document update is `PATCH https://readwise.io/api/v3/update/<document_id>/`.
- Reader document update supports replacing `tags`.
- Reader tag list is `GET https://readwise.io/api/v3/tags/`.
- Official source: https://readwise.io/reader_api

## Subtle Top-of-Page UI

The page-local UI should appear after capture and sit at the top of the page with minimal visual weight.

Expected content:

- Capture status: saved, tagging, synced, needs attention, or failed.
- Destination states:
  - Pinboard saved or failed.
  - Readwise Reader saved or failed.
- Tags applied, with compact edit affordance.
- Quick actions:
  - Open in Readwise Reader.
  - Open in Pinboard.
  - Edit tags.
  - Retry failed destination.
  - Dismiss.

Design constraints:

- No modal for normal success.
- Do not cover page content more than necessary.
- Use a restrained, browser-native feel.
- The UI should collapse or disappear automatically after a short success state, while leaving a small way to reopen if useful.
- It must not expose tokens or sensitive payload text.

## Architecture Notes

Likely implementation direction:

- Background service worker owns capture orchestration.
- Content script owns the top-of-page status UI.
- Shared capture model describes item, tags, destination states, and errors.
- Existing Options Data Preview remains the review/privacy surface.
- The new top-page UI is operational feedback, not a settings dashboard.

Potential runtime flow:

1. User invokes capture from extension action, context menu, or keyboard shortcut.
2. Background extracts current tab data.
3. Background imports or reads known Pinboard tags.
4. LLM suggests existing/new tags.
5. Background saves to Pinboard.
6. Background creates or updates Readwise Reader document.
7. Background sends capture result to content script.
8. Content script renders subtle top-page UI with status and actions.

## Risks and Questions

- Readwise Reader API supports create, update, tag list, and tag replacement, but duplicate handling still needs product testing around the `200` existing-document response.
- Pinboard description semantics need to be mapped clearly: page excerpt vs user-authored description vs extended field.
- The extension should avoid surprising writes to both systems if the user expects only one destination.
- Current permissions may need to be adjusted for a persistent page-local content UI.
- Error handling should distinguish LLM failure from Pinboard failure and Readwise failure.

## Suggested Next Plan

1. Confirm Readwise Reader API endpoints and tag behavior.
2. Define a shared capture result model.
3. Add background capture orchestration for Pinboard + Readwise.
4. Add content-script top-page UI for capture result.
5. Add Options settings for destination defaults and tag confirmation behavior.
6. Add tests around tag selection, duplicate handling, and partial destination failure.
