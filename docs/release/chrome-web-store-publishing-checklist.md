# Chrome Web Store Publishing Checklist

Last updated: 2026-06-22

This checklist records the current Chrome Web Store publishing flow for `tldr`.

## Current Upload Artifact

- Package: `tldr-v0.1.1.zip`
- Build source: `dist/`
- Required ZIP invariant: `manifest.json` must be at the ZIP root.
- Current local validation already performed on 2026-06-12:
  - `pnpm test`
  - `pnpm exec tsc --noEmit`
  - `pnpm build`
  - `pnpm package`
  - `unzip -l tldr-v0.1.1.zip`

## Before Upload

- [ ] Load `dist/` as an unpacked extension in Chrome.
- [ ] Open the Options page.
- [ ] Verify the Data Preview section is screenshot-safe:
  - API keys and integration tokens are not visible.
  - Current-tab excerpt text is hidden by default.
  - Local storage, Chrome sync storage, and external API destinations are distinguishable.
- [ ] Run the main user flows manually:
  - Preview Current Tab.
  - Save & Tag Current Tab.
  - Import Pinboard tags.
  - Export selected items to GoodLinks, if configured.
  - Export selected items to Readwise Reader, if configured.
- [ ] Confirm `static/manifest.json` permissions are still minimal and explainable.
- [ ] Rebuild and package after any final code, manifest, image, or docs change:
  - `pnpm test`
  - `pnpm exec tsc --noEmit`
  - `pnpm build`
  - `pnpm package`

## Store Listing

- [ ] Create or update the item in the Chrome Web Store Developer Dashboard.
- [ ] Upload `tldr-v0.1.1.zip`.
- [ ] Add a short description.
- [ ] Add a full description covering:
  - Save the current page.
  - Extract readable text.
  - Generate tags through a user-configured OpenAI-compatible LLM endpoint.
  - Sync or export to Pinboard, GoodLinks, and Readwise Reader.
  - No tldr-hosted backend.
- [ ] Add screenshots:
  - Options page with Data Preview.
  - LLM configuration.
  - Integrations.
  - Sync/export workflow.
- [ ] Add promotional images if available and correctly sized.
- [ ] Select category and language.

## Privacy Practices

- [ ] Declare handled data categories:
  - Page title.
  - Page URL.
  - Domain.
  - Readable text or excerpt.
  - Generated tags.
  - Saved item metadata.
  - API keys and integration tokens.
- [ ] State the purpose:
  - Page data is used to save links and generate tags.
  - Tokens are used only to call user-configured services.
- [ ] State that tldr has no hosted backend.
- [ ] State that API keys, Pinboard tokens, and Readwise tokens are not sent to the LLM payload.
- [ ] State that remote API calls are made only to user-configured LLM hosts and configured integrations.
- [ ] State that the extension does not load remotely hosted executable code.
- [ ] Provide a public privacy policy URL if required by the dashboard.
- [ ] Complete the Limited Use / user data handling disclosures.

## Permission Rationale

- [ ] `storage`: stores settings, saved items, tag cache, and local secret references.
- [ ] `activeTab`: accesses the page only when the user previews or saves the active tab.
- [ ] `scripting`: injects the extraction/readability script into the active tab after user action.
- [ ] `contextMenus`: opens settings from the extension action menu.
- [ ] `notifications`: verify whether still needed; remove if unused.
- [ ] `alarms`: verify whether still needed; remove if unused.
- [ ] Host permissions:
  - Pinboard API for tag import and bookmark sync.
  - Readwise API for Reader export.
  - User-approved LLM host permission for tagging.

## Reviewer Instructions

- [ ] Explain how to open the Options page.
- [ ] Explain that a reviewer can use Data Preview without entering private API keys.
- [ ] Explain how to configure a test LLM endpoint if they want to test tagging.
- [ ] Explain which integrations require tokens and what can be tested without them.
- [ ] Mention that excerpt text is hidden until explicitly expanded.

## Submit

- [ ] Save the Developer Dashboard item as draft.
- [ ] Preview the listing.
- [ ] Compare listing privacy claims against the in-product Data Preview.
- [ ] Submit for review.
- [ ] Record reviewer feedback and required follow-up changes in `docs/release/`.

## Official References

- Chrome Web Store publishing: https://developer.chrome.com/docs/webstore/publish
- Prepare extension ZIP: https://developer.chrome.com/docs/webstore/prepare
- Privacy practices: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- User data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Review process: https://developer.chrome.com/docs/webstore/review-process
