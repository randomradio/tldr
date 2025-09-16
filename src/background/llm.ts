import { getSecret, getSettings } from '@common/storage';

export interface LlmTagResponse { tags: { name: string; confidence?: number }[] }

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

  const res = await fetch(`${settings.llm.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {})
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
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
