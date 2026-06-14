// ============================================================================
// AI Builder OS (ABA) — LLM Provider Abstraction
// ============================================================================

import { requestUrl } from 'obsidian';
import type { LLMProvider, LLMRequestParams } from './types';

// -- Provider definitions ----------------------------------------------------

const OPENAI_COMPATIBLE_BUILDER = (
  name: string,
  defaultModel: string,
  defaultEndpoint: string,
): LLMProvider => ({
  name,
  defaultModel,
  endpoint: defaultEndpoint,

  buildRequest({ model, maxTokens, temperature, system, user }: LLMRequestParams) {
    const messages: Array<{ role: string; content: string }> = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });
    return {
      model: model || defaultModel,
      max_tokens: maxTokens,
      temperature,
      messages,
    };
  },

  buildHeaders(apiKey: string) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
  },

  extractText(data: any): string {
    if (data?.choices?.[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    throw new Error(`Unexpected response format: ${JSON.stringify(data).slice(0, 200)}`);
  },
});

const ANTHROPIC_PROVIDER: LLMProvider = {
  name: 'Anthropic Claude',
  defaultModel: 'claude-sonnet-4-6',
  endpoint: 'https://api.anthropic.com/v1/messages',

  buildRequest({ model, maxTokens, temperature, system, user }: LLMRequestParams) {
    return {
      model: model || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    };
  },

  buildHeaders(apiKey: string) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
  },

  extractText(data: any): string {
    if (data?.content) {
      return data.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
    }
    throw new Error(`Unexpected Anthropic response: ${JSON.stringify(data).slice(0, 200)}`);
  },
};

// -- Provider registry -------------------------------------------------------

export const LLM_PROVIDERS: Record<string, LLMProvider> = {
  deepseek: OPENAI_COMPATIBLE_BUILDER('DeepSeek', 'deepseek-chat', 'https://api.deepseek.com/v1/chat/completions'),
  openai:   OPENAI_COMPATIBLE_BUILDER('OpenAI', 'gpt-4o', 'https://api.openai.com/v1/chat/completions'),
  anthropic: ANTHROPIC_PROVIDER,
  custom:   OPENAI_COMPATIBLE_BUILDER('Custom', 'default', ''), // endpoint from settings
};

// -- Main call function ------------------------------------------------------

export interface CallLLMOpts {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  providerName: string;
  model: string;
  endpoint: string;
  apiKey: string;
}

export async function callLLM(opts: CallLLMOpts): Promise<string> {
  const provider = LLM_PROVIDERS[opts.providerName];
  if (!provider) {
    throw new Error(`Unknown LLM provider: "${opts.providerName}". Supported: ${Object.keys(LLM_PROVIDERS).join(', ')}`);
  }

  const endpoint = opts.endpoint || provider.endpoint;
  if (!endpoint) throw new Error('No endpoint configured. Set one in plugin settings.');

  const body = provider.buildRequest({
    model: opts.model || provider.defaultModel,
    maxTokens: opts.maxTokens || 4000,
    temperature: opts.temperature ?? 0.5,
    system: opts.system,
    user: opts.user,
  });

  const headers = provider.buildHeaders(opts.apiKey);

  const response = await requestUrl({
    url: endpoint,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (response.status < 200 || response.status >= 300) {
    const errText = response.text || JSON.stringify(response.json);
    throw new Error(`${provider.name} API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  return provider.extractText(response.json);
}
