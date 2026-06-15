// ============================================================================
// Feed Fetcher — Zara feeds + official company RSS
// ============================================================================

import { requestUrl } from 'obsidian';
import type { FeedData, FeedBuilder, FeedPodcast, FeedBlog, RSSItem } from './types';

// Central feeds from follow-builders (Zara Zhang, MIT licensed)
const FEED_URLS = {
  x:        'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json',
  podcasts: 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json',
  blogs:    'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json',
};

// Official company RSS feeds (老板视角 — 公司官方公告)
const RSS_FEEDS = [
  { url: 'https://openai.com/blog/rss.xml',          source: 'OpenAI' },
  { url: 'https://machinelearning.apple.com/rss.xml', source: 'Apple ML' },
];

export async function fetchFeeds(): Promise<FeedData> {
  const [feedX, feedPodcasts, feedBlogs, rssItems] = await Promise.all([
    fetchJSON(FEED_URLS.x),
    fetchJSON(FEED_URLS.podcasts),
    fetchJSON(FEED_URLS.blogs),
    fetchRSSFeeds(),
  ]);

  const xBuilders: FeedBuilder[] = feedX?.x || [];
  const podcasts: FeedPodcast[] = feedPodcasts?.podcasts || [];
  const blogs: FeedBlog[] = feedBlogs?.blogs || [];

  return {
    x: xBuilders,
    podcasts,
    blogs,
    rss: rssItems,
    stats: {
      totalTweets: xBuilders.reduce((sum, b) => sum + (b.tweets?.length || 0), 0),
      podcastEpisodes: podcasts.length,
      blogPosts: blogs.length,
      rssItems: rssItems.length,
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

  // Blogs (from follow-builders)
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

  // Official Company News (RSS — 老板视角)
  if (data.rss && data.rss.length > 0) {
    parts.push('## 🏢 Official Company News (官方公司公告)', '');
    // Group by source
    const bySource = new Map<string, RSSItem[]>();
    for (const item of data.rss) {
      const list = bySource.get(item.source) || [];
      list.push(item);
      bySource.set(item.source, list);
    }
    for (const [source, items] of bySource) {
      parts.push(`### ${source}`, '');
      for (const item of items) {
        parts.push(
          `- **${item.title}**`,
          `  URL: ${item.url}`,
          `  Published: ${item.publishedAt?.slice(0, 16) || '?'}`,
          item.description ? `  Summary: ${item.description.slice(0, 300)}` : '',
          '',
        );
      }
    }
  }

  return parts.join('\n');
}

// -- RSS Feed Fetcher (老板视角 — 公司官方公告) ----------------------------

async function fetchRSSFeeds(): Promise<RSSItem[]> {
  const results: RSSItem[] = [];
  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRSS(feed.url, feed.source);
      results.push(...items);
    } catch (err) {
      console.warn(`[ABA] RSS fetch failed for ${feed.source}:`, (err as Error).message);
      // Non-fatal — continue without this source
    }
  }
  return results;
}

async function fetchRSS(url: string, source: string): Promise<RSSItem[]> {
  const response = await requestUrl({ url, method: 'GET' });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = response.text;
  const items: RSSItem[] = [];

  // Simple regex-based RSS/Atom parser — no external dependencies needed
  // Match <item>...</item> (RSS) or <entry>...</entry> (Atom)
  const itemRegex = /<(item|entry)>([\s\S]*?)<\/(item|entry)>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[2];
    const title = extractTag(block, 'title');
    const link = extractLink(block);
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
    const description = extractTag(block, 'description') || extractTag(block, 'summary') || extractTag(block, 'content');

    if (title && link) {
      items.push({
        title: decodeXML(title).slice(0, 200),
        url: link,
        publishedAt: pubDate ? decodeXML(pubDate).slice(0, 25) : '',
        description: description ? decodeXML(description).replace(/<[^>]*>/g, '').slice(0, 500) : '',
        source,
      });
    }

    // Only take last 5 items per source — enough for a daily digest
    if (items.filter(i => i.source === source).length >= 5) break;
  }

  return items;
}

function extractTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : '';
}

function extractLink(block: string): string {
  // RSS standard <link>url</link> — try FIRST (Atom <link href> would steal it)
  let match = block.match(/<link>([^<]*)<\/link>/i);
  if (match) return match[1].trim();
  // Atom <link href="url"/>
  match = block.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i);
  return match ? match[1].trim() : '';
}

function decodeXML(str: string): string {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')  // strip CDATA wrappers
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// -- Language ----------------------------------------------------------------

export function getLanguageInstruction(lang: string): string {
  switch (lang) {
    case 'zh': return 'Generate the entire output in Chinese (Simplified). Translate all English content to Chinese.';
    case 'bilingual': return 'Bilingual: each paragraph in English followed by its Chinese translation. Interleave paragraph by paragraph.';
    case 'en':
    default: return 'Generate the entire output in English.';
  }
}
