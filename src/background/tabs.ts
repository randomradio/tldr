export interface ExtractedContent {
  url: string;
  title: string;
  domain: string;
  text?: string;
}

export async function extractFromActiveTab(tabId: number): Promise<ExtractedContent> {
  // Inject into the isolated world so a real Readability build can attach to this world.
  // static/readability.js ships as a stub until replaced with Mozilla Readability.
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['readability.js'] });
  } catch {
    // Optional enhancement; extraction still has a DOM fallback.
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const url = location.href;
      const title = document.title || '';
      const domain = location.hostname;
      const readability = (window as unknown as {
        Readability?: new (doc: Document) => { parse: () => { textContent?: string } | null };
      }).Readability;

      let text = '';
      try {
        if (readability) {
          const article = new readability(document.cloneNode(true) as Document).parse();
          text = article?.textContent || '';
        }
      } catch {
        // Fall through to semantic DOM extraction.
      }

      if (!text) {
        const root = document.querySelector('article, main, [role="main"]') || document.body;
        if (root) {
          const clone = root.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('script, style, noscript, nav, footer, aside, iframe, [role="navigation"]').forEach((el) => el.remove());
          text = (clone.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
        }
      }

      if (!text) text = document.body?.innerText?.trim() || '';
      return { url, title, domain, text };
    }
  });

  if (!injection?.result) throw new Error('Could not extract the current tab');
  return injection.result as ExtractedContent;
}
