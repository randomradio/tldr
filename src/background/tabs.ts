export interface ExtractedContent {
  url: string;
  title: string;
  domain: string;
  text?: string;
}

export async function extractFromActiveTab(tabId: number): Promise<ExtractedContent> {
  // Attempt to inject readability.js if present in the extension
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['readability.js'] }); } catch {}
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const url = location.href;
      const title = document.title || '';
      const domain = location.hostname;
      // If Readability is present, prefer it. Otherwise fallback to body text.
      // @ts-ignore
      const hasReadability = typeof window.Readability !== 'undefined';
      let text = '';
      try {
        if (hasReadability) {
          // @ts-ignore
          const article = new window.Readability(document.cloneNode(true)).parse();
          text = article?.textContent || '';
        }
      } catch {}
      if (!text) text = document.body?.innerText?.trim() || '';
      return { url, title, domain, text };
    }
  });
  return result as ExtractedContent;
}
