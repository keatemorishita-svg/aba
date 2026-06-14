// ============================================================================
// AI Builder OS (ABA) — Shared Types
// ============================================================================

/** Plugin settings persisted to Obsidian data.json */
export interface BuilderOSSettings {
  apiKey: string;
  provider: LLMProviderName;
  model: string;
  endpoint: string;        // custom endpoint override (for Ollama etc.)
  language: 'zh' | 'en' | 'bilingual';
  scheduleTime: string;    // "HH:MM" in local time
  outputFolder: string;    // vault-relative path, default "AI Builder OS"
  lastRunDate: string;     // "YYYY-MM-DD" of last successful run
}

export type LLMProviderName = 'deepseek' | 'openai' | 'anthropic' | 'custom';

/** A single tweet from the feed */
export interface FeedTweet {
  id: string;
  text: string;
  createdAt: string;
  url: string;
  likes: number;
  retweets: number;
  replies: number;
  isQuote: boolean;
  quotedTweetId?: string;
}

/** A builder from the X feed */
export interface FeedBuilder {
  source: 'x';
  name: string;
  handle: string;
  bio: string;
  tweets: FeedTweet[];
}

/** A podcast episode from the feed */
export interface FeedPodcast {
  source: 'podcast';
  name: string;
  title: string;
  guid: string;
  url: string;
  publishedAt: string;
  transcript: string;
}

/** A blog post from the feed */
export interface FeedBlog {
  source?: string;
  name?: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string;
}

/** Aggregated feed data */
export interface FeedData {
  x: FeedBuilder[];
  podcasts: FeedPodcast[];
  blogs: FeedBlog[];
  stats: {
    totalTweets: number;
    podcastEpisodes: number;
    blogPosts: number;
  };
}

/** Structured opinion extracted from digest */
export interface Opinion {
  id: string;
  title: string;
  type: 'paradigm_shift' | 'prediction' | 'contrarian_take' | 'framework' | 'product_insight' | 'market_signal';
  domain: string[];
  oneLiner: string;
  coreClaim: string;
  whyImportant: string;
  whoAffected: string[];
  source: string;
  sourceUrl: string;
}

/** A builder persona definition */
export interface Persona {
  name: string;
  slug: string;
  content: string;
}

/** Consensus entry from the daily analysis */
export interface ConsensusEntry {
  theme: string;
  builders: string[];
  convergence: string;
  perspectives: string[];
  signalStrength: '🔴 极强' | '🟡 强' | '🟢 值得关注';
}

/** LLM provider interface */
export interface LLMProvider {
  name: string;
  defaultModel: string;
  endpoint: string;
  buildRequest(params: LLMRequestParams): unknown;
  buildHeaders(apiKey: string): Record<string, string>;
  extractText(data: unknown): string;
}

export interface LLMRequestParams {
  model: string;
  maxTokens: number;
  temperature: number;
  system: string;
  user: string;
}

/** Default settings */
export const DEFAULT_SETTINGS: BuilderOSSettings = {
  apiKey: '',
  provider: 'deepseek',
  model: 'deepseek-chat',
  endpoint: '',
  language: 'zh',
  scheduleTime: '06:00',
  outputFolder: 'AI Builder OS',
  lastRunDate: '',
};
