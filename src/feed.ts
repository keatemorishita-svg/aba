// ============================================================================
// AI Builder OS (ABA) — Feed Fetcher
// ============================================================================

import { requestUrl } from 'obsidian';
import type { FeedData, FeedBuilder, FeedPodcast, FeedBlog } from './types';

// Central feeds from follow-builders (Zara Zhang, MIT licensed)
const FEED_URLS = {
  x:        'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json',
  podcasts: 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json',
  blogs:    'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json',
};

export async function fetchFeeds(): Promise<FeedData> {
  const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
    fetchJSON(FEED_URLS.x),
    fetchJSON(FEED_URLS.podcasts),
    fetchJSON(FEED_URLS.blogs),
  ]);

  const xBuilders: FeedBuilder[] = feedX?.x || [];
  const podcasts: FeedPodcast[] = feedPodcasts?.podcasts || [];
  const blogs: FeedBlog[] = feedBlogs?.blogs || [];

  return {
    x: xBuilders,
    podcasts,
    blogs,
    stats: {
      totalTweets: xBuilders.reduce((sum, b) => sum + (b.tweets?.length || 0), 0),
      podcastEpisodes: podcasts.length,
      blogPosts: blogs.length,
    },
  };
}

async function fetchJSON(url: string): Promise<any> {
  const response = await requestUrl({ url, method: 'GET' });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.json;
}

// -- Helpers for building LLM content summaries -------------------------------

export function buildContentSummary(data: FeedData): string {
  const parts: string[] = [];

  // X/Twitter
  parts.push('## X / Twitter Posts', '');
  for (const builder of data.x) {
    const role = builder.bio ? ` (${builder.bio.split('\n')[0].trim()})` : '';
    parts.push(`### ${builder.name}${role}`);
    parts.push(`Handle: ${builder.handle}`);
    for (const tweet of builder.tweets) {
      parts.push(
        `- [${tweet.createdAt?.slice(0, 16) || '?'}] ${tweet.text}`,
        `  URL: ${tweet.url}`,
        `  Likes: ${tweet.likes}, Retweets: ${tweet.retweets}, Replies: ${tweet.replies}`,
        tweet.isQuote ? '  [Quote Tweet]' : '',
      );
    }
    parts.push('');
  }

  // Podcasts
  if (data.podcasts.length > 0) {
    parts.push('## Podcast Episodes', '');
    for (const ep of data.podcasts) {
      const preview = (ep.transcript || '').slice(0, 6000);
      parts.push(
        `### ${ep.name} — ${ep.title}`,
        `URL: ${ep.url}`,
        `Published: ${ep.publishedAt?.slice(0, 10) || '?'}`,
        '',
        'Transcript (first 6000 chars):',
        preview,
        preview.length < (ep.transcript || '').length ? '...(truncated)' : '',
        '',
      );
    }
  }

  // Blogs
  if (data.blogs.length > 0) {
    parts.push('## Blog Posts', '');
    for (const blog of data.blogs) {
      parts.push(
        `### ${blog.title || 'Untitled'}`,
        `Source: ${blog.source || blog.name || ''}`,
        `URL: ${blog.url}`,
        blog.summary ? `Summary: ${blog.summary}` : '',
        '',
      );
    }
  }

  return parts.join('\n');
}

export function getLanguageInstruction(lang: string): string {
  switch (lang) {
    case 'zh': return 'Generate the entire output in Chinese (Simplified). Translate all English content to Chinese.';
    case 'bilingual': return 'Bilingual: each paragraph in English followed by its Chinese translation. Interleave paragraph by paragraph.';
    case 'en':
    default: return 'Generate the entire output in English.';
  }
}
