TL;DR Browser Extension (MV3)

Goal: Save links, extract page content, generate tags with an OpenAI‑compatible LLM, and sync to Pinboard. No backend.

Structure
- static/: manifest, HTML assets, placeholder readability.js
- src/background/: service worker, pipeline, LLM, Pinboard, tabs helpers
- src/ui/: popup and options scripts
- src/common/: types and storage helpers

Build
- Requires Node 18+.
- Install deps: npm install
- Build: npm run build (or npm run watch)
- Load unpacked: point Chrome to the dist/ directory

Configure
- Open the extension’s Options page.
- LLM: set base URL (e.g., http://localhost:11434/v1 for Ollama), model, optional API key. Enable JSON mode if supported.
- Pinboard: paste auth token (user:token), set defaults for shared/to read.
- Privacy: choose how much content to send to LLM (title only, title+excerpt, or truncated full text).

Readability (optional, recommended)
- The extractor tries to use window.Readability if available; otherwise it falls back to body.innerText.
- To enable high‑quality extraction, replace static/readability.js with Mozilla Readability’s UMD bundle and rebuild.

Security
- API keys are stored in chrome.storage.local. This is suitable for personal use; avoid publishing the CRX with secrets.

Next Steps
- Wire Pinboard tag import for known tags (GET https://api.pinboard.in/v1/tags/get).
- Add a tag editor in the popup before syncing.
- Add optional_host_permissions request for your chosen LLM host if it differs from defaults.

# tldr
