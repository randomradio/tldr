import { getSecret, getSettings } from '@common/storage';

export interface LlmTagResponse { tags: { name: string; confidence?: number }[] }

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('LLM base URL is empty');
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

function extractErrorDetail(raw: string): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string };
      detail?: string;
      message?: string;
    };
    return parsed?.error?.message || parsed?.detail || parsed?.message;
  } catch {
    return raw.trim();
  }
}

export async function generateTags(ctx: { title: string; url: string; domain: string; excerpt?: string; knownTags: string[] }): Promise<string[]> {
  const settings = await getSettings();
  const key = settings.llm.apiKeyRef ? await getSecret(settings.llm.apiKeyRef) : undefined;

  const system = 'You tag bookmarks. Prefer existing tags from the provided list; avoid near-duplicates. Output strict JSON {"tags":[{"name":"lowercase-slug","confidence":0-1}]}.';
  const contentParts = [
    `Title: ${ctx.title}`,
    `URL: ${ctx.url}`,
    `Domain: ${ctx.domain}`,
    ctx.excerpt ? `Excerpt: ${ctx.excerpt.slice(0, settings.llm.maxChars)}` : undefined,
    `Known tags: ${ctx.knownTags.join(', ')}`
  ].filter(Boolean);
  const user = contentParts.join('\n');

  const body: any = {
    model: settings.llm.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2
  };
  if (settings.llm.jsonMode) (body as any).response_format = { type: 'json_object' };

  const url = chatCompletionsUrl(settings.llm.baseUrl);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {})
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM request failed: ${message}. Verify the LLM host permission and network access.`);
  }
  if (!res.ok) {
    const detail = extractErrorDetail(await res.text());
    const msg = detail ? `: ${detail}` : '';
    throw new Error(`LLM error ${res.status}${msg}`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error('LLM returned a non-JSON response');
  }

  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('')
      : '';
  let parsed: LlmTagResponse | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // attempt to extract JSON
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch {}
    }
  }
  if (!parsed || !Array.isArray(parsed.tags)) return [];
  const tags = parsed.tags.map((t) => String(t.name || '').toLowerCase()).filter(Boolean);
  return Array.from(new Set(tags));
}
