**tldr – A Thinking Partner for Everything You Save**
- We squirrel away links, highlights, and threads because they might be “useful someday.” Then real life hits and the backlog fossilises. I built tldr to be the missing layer between capture and insight—a browser companion that not only grabs the page, but helps you organise it, reflect on it, and create something new from it.

### The Problem We’re Solving
- Read-it-later services (Pinboard, Readwise, GoodLinks) are excellent at hoarding content, not so great at helping you *think* about it. They expect you to remember what you saved, tag it carefully, and somehow make time to revisit it all. Most of us never do.
- Obsidian-style personal knowledge bases are powerful but demand discipline: manually linking notes, managing tags, curating vaults. If you’re already drowning in unread articles, you don’t have spare cycles to tidy the library.
- Result: a pile of “important” stuff with no structure, no ritual for review, and no easy way to move from consumption to creation.

### The Vision
- **Collect effortlessly.** A single click capture that extracts clean text, stores it locally, and syncs with the services you already use. Import your existing Pinboard or Readwise collections so the system starts useful on day one.
- **Organise with smart tags, not chores.** The extension sends the content to your favourite LLM (Ollama on localhost, a cloud model, anything OpenAI-compatible) to suggest canonical tags, relate items, and surface themes. You stay in control—curate synonyms, pin focus topics, merge duplicates—but the heavy lifting is automated.
- **Reflect through scheduled reports.** Imagine a Friday digest that says, “You saved six pieces on evaluation frameworks and three on climate tech. Here are the summaries, here’s what changed since last month, here’s a question to explore next.” tldr wants to build that ritual for you.
- **Inspire new ideas.** Beyond summaries, the assistant can remix your saved content: propose blog outlines, connect disparate articles, prompt you with “What if…” questions—anything that nudges you to create rather than collect.

### Feature List
- Capture the current tab and extract readable content with the built-in readability fallback.
- Auto-tag new items by calling an OpenAI-compatible `chat/completions` endpoint that you configure at runtime—no hard-coded hosts, no forced vendors.
- Sync saved items to Pinboard (including tag import/export), with GoodLinks and Readwise exports on deck.
- Store everything locally; no backend service required.
- Navigate a full options dashboard for configuring LLM models, privacy modes, tag behaviour, and integrations.

### Getting Started
- Install Node 18+.
- `npm install` to pull dependencies.
- `npm run build` for a one-off bundle (or `npm run watch` while hacking).
- Load the unpacked extension from the freshly created `dist/` directory in Chrome.
- Hop into the Options page to plug in your LLM base URL, model name, and optional API key; paste your Pinboard token; choose how much content is shared with the LLM.

### Packaging & Release Ritual
- Bump version in `package.json` (the build script mirrors it into `dist/manifest.json` automatically).
- `npm run build` then `npm run package` (see `scripts/package.mjs`) to produce `tldr-v<version>.zip`.
- Upload to the Chrome Web Store with updated screenshots and data-collection notes.
- Tag the release (`git tag v<version> && git push origin --tags`), draft GitHub notes, and attach the zip for sideloaders.

### Contributing & Feedback
- I’m dogfooding the tool to tame my own reading queue, but the north star is a community-sourced thinking partner. Open issues for features you crave, integrations you rely on, or moments where the flow breaks.
- Want to explore the “report” or “idea lab” concepts early? Reach out—I’d love to collaborate on prototypes.
- The best compliment is a story: “tldr helped me turn three unrelated articles into a pitch deck.” If that ever happens, please share. That’s the energy powering this project.
