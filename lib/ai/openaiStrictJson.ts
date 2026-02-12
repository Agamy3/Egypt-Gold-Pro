import 'server-only';

type OpenAiJsonResult<T> =
  | { ok: true; json: T; rawText: string }
  | { ok: false; error: string; rawText?: string };

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export async function callOpenAiStrictJson<T>(args: {
  systemPrompt: string;
  userJson: unknown;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}): Promise<OpenAiJsonResult<T>> {
  const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, error: 'missing_OPENAI_API_KEY' };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), args.timeoutMs);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        temperature: args.temperature,
        max_tokens: args.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: args.systemPrompt },
          { role: 'user', content: JSON.stringify(args.userJson) },
        ],
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `openai_http_${res.status}`, rawText: text.slice(0, 2000) };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'openai_bad_json', rawText: text.slice(0, 2000) };
    }

    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, error: 'openai_missing_content', rawText: text.slice(0, 2000) };
    }

    try {
      const obj = JSON.parse(content) as unknown;
      if (!isRecord(obj)) return { ok: false, error: 'openai_content_not_object', rawText: content };
      return { ok: true, json: obj as T, rawText: content };
    } catch {
      return { ok: false, error: 'openai_content_not_json', rawText: content };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes('aborted') ? 'openai_timeout' : 'openai_network_error' };
  } finally {
    clearTimeout(t);
  }
}

