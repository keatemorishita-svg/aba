// ============================================================================
// AI Builder OS (ABA) — Generation Engine
// ============================================================================

import type { BuilderOSSettings, FeedData, Opinion, Persona, ConsensusEntry } from './types';
import { fetchFeeds, buildContentSummary, getLanguageInstruction } from './feed';
import { callLLM } from './llm';

// -- Prompt loading ----------------------------------------------------------

// Default prompts are imported as text at build time (esbuild .md loader).
// In dev without esbuild, they fall back to hardcoded minimal versions.
let _promptImports: Record<string, string> | null = null;

async function getPromptImports(): Promise<Record<string, string>> {
  if (_promptImports) return _promptImports;
  try {
    // Dynamic imports with esbuild text loader
    const modules = await Promise.all([
      import('../prompts/digest-intro.md'),
      import('../prompts/summarize-tweets.md'),
      import('../prompts/summarize-podcast.md'),
      import('../prompts/summarize-blogs.md'),
      import('../prompts/translate.md'),
      import('../prompts/extract-opinions.md'),
      import('../prompts/generate-atomic-note.md'),
      import('../prompts/generate-questions.md'),
      import('../prompts/find-consensus.md'),
    ]);
    _promptImports = {
      digest_intro:        (modules[0] as any).default,
      summarize_tweets:    (modules[1] as any).default,
      summarize_podcast:   (modules[2] as any).default,
      summarize_blogs:     (modules[3] as any).default,
      translate:           (modules[4] as any).default,
      extract_opinions:    (modules[5] as any).default,
      generate_atomic_note:(modules[6] as any).default,
      generate_questions:  (modules[7] as any).default,
      find_consensus:      (modules[8] as any).default,
    };
  } catch {
    // Fallback: prompts will be loaded from plugin assets at runtime by main.ts
    _promptImports = {};
  }
  return _promptImports;
}

// Persona loading — imported at build time
let _personaImports: Record<string, string> | null = null;

async function getPersonaImports(): Promise<Record<string, string>> {
  if (_personaImports) return _personaImports;
  try {
    const slugs = ['dario-amodei', 'elon-musk', 'sam-altman', 'demis-hassabis', 'andrej-karpathy', 'aravind-srinivas'];
    const modules = await Promise.all(slugs.map(s => import(`../personas/${s}.md`)));
    _personaImports = {};
    for (let i = 0; i < slugs.length; i++) {
      _personaImports[slugs[i]] = (modules[i] as any).default;
    }
  } catch {
    _personaImports = {};
  }
  return _personaImports;
}

// -- Helpers -----------------------------------------------------------------

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sanitizeFilename(title: string | undefined | null): string {
  if (!title || typeof title !== 'string') return 'untitled';
  return title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'untitled';
}

const ATTRIBUTION = [
  '',
  '---',
  '',
  '*📡 数据来源：[follow-builders](https://github.com/zarazhangrui/follow-builders) by [Zara Zhang](https://x.com/zarazhangrui)*',
  '*🔧 本地 Remix：[AI Builder OS](https://github.com/zarazhangrui/follow-builders) · Follow builders, not influencers.*',
  '',
  '> ⚠️ **免责声明**：本内容中的「六人视角」为 AI 基于各位 Builder 的公开言论、已知思维模式和公开发表的观点进行的模拟推演，不代表其本人真实观点，也非其实际发言。所有原始信息均来自公开的 X/Twitter 推文、YouTube 播客转录和官方博客。本工具仅供个人学习与思考使用，不构成任何投资或商业建议。',
].join('\n');

// -- Compact Facts Section (for main daily file) ---------------------------

function buildFactsSection(data: FeedData): string {
  const lines: string[] = [];

  if (data.x.length > 0) {
    lines.push('### 𝕏 推文', '');
    for (const builder of data.x) {
      const role = builder.bio ? builder.bio.split('\n')[0].slice(0, 60) : '';
      const tweetCount = builder.tweets.length;
      const topTweet = builder.tweets[0];
      lines.push(
        `**${builder.name}**${role ? ` (${role})` : ''} — ${tweetCount} 条`,
        '',
      );
      if (topTweet) {
        lines.push(
          `> ${topTweet.text.slice(0, 150)}${topTweet.text.length > 150 ? '...' : ''}`,
          `> [原文](${topTweet.url})`,
          '',
        );
      }
    }
  }

  if (data.podcasts.length > 0) {
    lines.push('### 🎙️ 播客', '');
    for (const ep of data.podcasts) {
      lines.push(
        `**${ep.name}** — ${ep.title}`,
        '',
        `[YouTube](${ep.url})`,
        '',
      );
    }
  }

  if (data.blogs.length > 0) {
    lines.push('### 📝 博客', '');
    for (const blog of data.blogs) {
      lines.push(
        `**${blog.title}**`,
        `[原文](${blog.url})`,
        '',
      );
    }
  }

  return lines.join('\n');
}

// -- Phase 1: Feed (no LLM) --------------------------------------------------

function generateFeed(data: FeedData, date: string): string {
  const lines = [
    '---',
    `date: ${date}`,
    'type: feed',
    'sources: [x, podcast, blog]',
    '---',
    '',
    `# AI Feed — ${date}`,
    '',
    `> 原始数据缓存 · ${data.stats.totalTweets} 条推文 · ${data.stats.podcastEpisodes} 期播客 · ${data.stats.blogPosts} 篇博客`,
    '',
    '---',
    '',
  ];

  if (data.x.length > 0) {
    lines.push('## 𝕏 X / Twitter', '');
    for (const builder of data.x) {
      const role = builder.bio ? builder.bio.split('\n')[0].slice(0, 80) : '';
      lines.push(`### ${builder.name}${role ? ` — ${role}` : ''}`, '');
      for (const tweet of builder.tweets) {
        const dateStr = tweet.createdAt ? tweet.createdAt.slice(0, 10) : '';
        const stats = [];
        if (tweet.likes) stats.push(`❤️ ${tweet.likes}`);
        if (tweet.retweets) stats.push(`🔁 ${tweet.retweets}`);
        if (tweet.replies) stats.push(`💬 ${tweet.replies}`);
        const statsStr = stats.length > 0 ? ` (${stats.join(' · ')})` : '';
        lines.push(
          `- [[原文](${tweet.url})]${statsStr} _${dateStr}_`,
          `  > ${tweet.text.slice(0, 200)}${tweet.text.length > 200 ? '...' : ''}`,
          '',
        );
      }
    }
  }

  if (data.podcasts.length > 0) {
    lines.push('---', '', '## 🎙️ Podcast', '');
    for (const ep of data.podcasts) {
      lines.push(
        `### ${ep.name} — ${ep.title}`,
        '',
        `- **发布时间**: ${ep.publishedAt ? ep.publishedAt.slice(0, 10) : '未知'}`,
        `- **链接**: [YouTube](${ep.url})`,
        `- **转录长度**: ~${Math.round((ep.transcript || '').length / 1000)}k 字符`,
        '',
      );
    }
  }

  if (data.blogs.length > 0) {
    lines.push('---', '', '## 📝 官方博客', '');
    for (const blog of data.blogs) {
      lines.push(
        `### ${blog.title || 'Untitled'}`,
        '',
        `- **来源**: ${blog.source || blog.name || ''}`,
        `- **链接**: [原文](${blog.url})`,
        '',
      );
    }
  }

  return lines.join('\n');
}

// -- Phase 2: Digest (LLM Call 1) --------------------------------------------

async function generateDigest(
  data: FeedData,
  prompts: Record<string, string>,
  settings: BuilderOSSettings,
  date: string,
): Promise<string> {
  const systemPrompt = [
    prompts.digest_intro,
    '',
    '---',
    '## Content Summarization Rules',
    '### For Tweets:', prompts.summarize_tweets,
    '### For Podcasts:', prompts.summarize_podcast,
    '### For Blogs:', prompts.summarize_blogs,
    '### For Translation:', prompts.translate,
    '---',
    '## Opinion Extraction (CRITICAL)', prompts.extract_opinions,
  ].join('\n');

  const userPrompt = [
    `Today's date: ${date}`,
    `Language: ${settings.language} (${getLanguageInstruction(settings.language)})`,
    '',
    '## Raw Content to Process',
    buildContentSummary(data),
    '',
    '---',
    '## Output Format Requirements',
    'Generate the digest with: Overview → Key Opinions (with structured fields) → Podcast Highlights → Blog Posts.',
    'At the very end, append a ```opinions_json``` block with THIS EXACT format:',
    '```opinions_json',
    '[',
    '  {',
    '    "id": "english-slug-of-the-title",',
    '    "title": "Core Concept as Noun Phrase (English, max 10 words)",',
    '    "type": "market_signal|paradigm_shift|prediction|contrarian_take|framework|product_insight",',
    '    "domain": ["kebab-case-tag1", "kebab-case-tag2"],',
    '    "oneLiner": "One sharp sentence in the output language",',
    '    "coreClaim": "Detailed claim paragraph with reasoning",',
    '    "whyImportant": "1-2 sentences on implications — if this is true, what changes?"',
    '    "whoAffected": ["Specific Role 1", "Specific Role 2"],',
    '    "source": "Author Full Name",',
    '    "sourceUrl": "https://..."',
    '  }',
    ']',
    '```',
    '',
    '⚠️ FIELD NAMES ARE NON-NEGOTIABLE. Use EXACTLY: id, title, type, domain, oneLiner, coreClaim, whyImportant, whoAffected, source, sourceUrl.',
    'EVERY claim MUST have a source URL. No URL = do not include.',
  ].join('\n');

  return callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 8000,
    temperature: 0.4,
    providerName: settings.provider,
    model: settings.model,
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
  });
}

// -- Phase 3: Perspectives + Consensus (LLM Call 2) --------------------------

function parseOpinionsFromDigest(digestText: string): Opinion[] {
  const match = digestText.match(/```opinions_json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

async function generatePerspectives(
  digestText: string,
  opinions: Opinion[],
  personas: Record<string, string>,
  prompts: Record<string, string>,
  settings: BuilderOSSettings,
  date: string,
): Promise<string> {
  // Strip the opinions JSON from digest for cleaner input
  const cleanDigest = digestText.replace(/```opinions_json[\s\S]*?```/, '').trim();

  // Build a summary of key opinions for the prompt
  const opinionSummary = opinions
    .map(o => `- [${o.type}] ${o.oneLiner} (source: ${o.source}, url: ${o.sourceUrl})`)
    .join('\n');

  // Assemble persona descriptions
  const personaSlugs = ['dario-amodei', 'elon-musk', 'sam-altman', 'demis-hassabis', 'andrej-karpathy', 'aravind-srinivas'];
  const personaSection = personaSlugs
    .map(slug => {
      const content = personas[slug] || '';
      return `### ${slug}\n${content}`;
    })
    .join('\n\n---\n\n');

  const systemPrompt = [
    'You are a "Builder Board" simulator. You will be given:',
    '1. Six detailed cognitive models of top AI builders',
    '2. A digest of today\'s AI news with structured opinion data',
    '',
    'Your task:',
    '1. FIRST, run the consensus discovery — scan all 6 cognitive models against today\'s',
    '   digest and identify where 3+ builders with different thinking styles converge.',
    '2. THEN, for EACH builder, generate a 150-250 word perspective on today\'s news,',
    '   applying their specific cognitive model, decision algorithm, and skepticism.',
    '   Each perspective MUST feel distinct — a reader should be able to tell who',
    '   is speaking without reading the name.',
    '',
    '---',
    '',
    '## The Six Builders',
    personaSection,
    '',
    '---',
    '',
    '## Consensus Discovery',
    prompts.find_consensus,
    '',
    '---',
    '',
    '## CRITICAL RULES',
    '- Each builder MUST reference at least one specific claim or URL from today\'s digest.',
    '- Perspectives MUST differ from each other. If two builders sound the same, you failed.',
    '- NEVER fabricate. Only use facts from the digest.',
    '- Use the builder\'s speaking style (short sentences for Musk, probabilistic for Dario, etc.).',
  ].join('\n');

  const userPrompt = [
    `Today's date: ${date}`,
    `Language: ${settings.language}`,
    '',
    '## Today\'s Digest',
    cleanDigest.slice(0, 6000),
    '',
    '## Key Opinions Summary',
    opinionSummary,
    '',
    '---',
    '',
    'Generate the consensus discovery first, then all 6 Builder perspectives.',
    'Output format (STRICT — follow this exact order):',
    '',
    '## 🤝 今日共识',
    '',
    '[Consensus entries or "今日无显著共识——六位 Builder 的判断较为分散，尚无三人以上达成同一判断。"]',
    '',
    '---',
    '',
    '## 🧠 六人视角',
    '',
    '### Dario Amodei',
    '[Perspective]',
    '',
    '### Elon Musk',
    '[Perspective]',
    '',
    '### Sam Altman',
    '[Perspective]',
    '',
    '### Demis Hassabis',
    '[Perspective]',
    '',
    '### Andrej Karpathy',
    '[Perspective]',
    '',
    '### Aravind Srinivas',
    '[Perspective]',
  ].join('\n');

  return callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 6000,
    temperature: 0.5,
    providerName: settings.provider,
    model: settings.model,
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
  });
}

// -- Phase 4: Thinking (LLM Call 3, optional) --------------------------------

async function generateThinking(
  digestText: string,
  perspectivesText: string,
  prompts: Record<string, string>,
  settings: BuilderOSSettings,
  date: string,
): Promise<string> {
  const cleanDigest = digestText.replace(/```opinions_json[\s\S]*?```/, '').trim();

  const userPrompt = [
    `Today's date: ${date}`,
    `Language: ${settings.language}`,
    '',
    '## Digest',
    cleanDigest.slice(0, 4000),
    '',
    '## Six Builder Perspectives',
    perspectivesText.slice(0, 4000),
    '',
    'Generate the Daily Thinking document following your system prompt.',
  ].join('\n');

  return callLLM({
    system: prompts.generate_questions,
    user: userPrompt,
    maxTokens: 3000,
    temperature: 0.6,
    providerName: settings.provider,
    model: settings.model,
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
  });
}

// -- Main orchestrator -------------------------------------------------------

export interface GenerationResult {
  date: string;
  files: Array<{ path: string; content: string }>;
  opinionCount: number;
  digestLength: number;
}

export async function runGeneration(settings: BuilderOSSettings): Promise<GenerationResult> {
  const date = today();

  // Load prompts and personas
  const prompts = await getPromptImports();
  const personas = await getPersonaImports();

  if (Object.keys(prompts).length === 0) {
    throw new Error('No prompts loaded. Ensure prompt files are bundled with the plugin.');
  }
  if (Object.keys(personas).length === 0) {
    throw new Error('No personas loaded. Ensure persona files are bundled with the plugin.');
  }

  // 1. Fetch feeds
  const data = await fetchFeeds();
  if (data.stats.totalTweets === 0 && data.stats.podcastEpisodes === 0 && data.stats.blogPosts === 0) {
    throw new Error('No new content in feeds today.');
  }

  // 2. Generate Feed (no LLM)
  let feedMD = generateFeed(data, date);

  // 3. Generate Digest (LLM Call 1)
  let digestText = await generateDigest(data, prompts, settings, date);
  const opinions = parseOpinionsFromDigest(digestText);

  // 4. Generate Perspectives + Consensus (LLM Call 2)
  let perspectivesText = await generatePerspectives(digestText, opinions, personas, prompts, settings, date);

  // 5. Generate Thinking (LLM Call 3 — lighter, can fail gracefully)
  let thinkingText: string;
  try {
    thinkingText = await generateThinking(digestText, perspectivesText, prompts, settings, date);
  } catch (err) {
    thinkingText = [
      '---',
      `date: ${date}`,
      'type: thinking',
      '---',
      '',
      `# Daily Thinking — ${date}`,
      '',
      '_(Thinking generation skipped — LLM call failed)_',
      '',
      '## 📋 今日行动',
      '- [ ] ',
      '- [ ] ',
    ].join('\n');
  }

  // 6. Append attribution + build daily main file
  digestText = digestText.replace(/```opinions_json[\s\S]*?```\s*$/, '').trimEnd() + '\n' + ATTRIBUTION;
  feedMD = feedMD.trimEnd() + '\n' + ATTRIBUTION;
  perspectivesText = perspectivesText.trimEnd() + '\n' + ATTRIBUTION;
  thinkingText = thinkingText.trimEnd() + '\n' + ATTRIBUTION;

  const base = settings.outputFolder;

  // Build compact facts section for the main daily file
  const factsSection = buildFactsSection(data);

  // Build filename: 今日共识 YYYY-MM-DD HHMM
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const mainFilename = `今日共识 ${date} ${timeStr}.md`;

  // Main daily file = perspectives (consensus + 6 views) + facts at the bottom
  // This is the 总——users see the conclusion first, drill down for details
  const dailyMain = [
    perspectivesText,
    '',
    '---',
    '',
    '## 📡 今日素材',
    '',
    `> 共 ${data.stats.totalTweets} 条推文 · ${data.stats.podcastEpisodes} 期播客 · ${data.stats.blogPosts} 篇博客`,
    `> 详细摘要：[[${base}/Digest/${date}|${date} Digest]] · 原始数据：[[${base}/Feed/${date}|Feed]]`,
    '',
    factsSection,
  ].join('\n');

  // 7. Build file list — 总-分-分 结构
  const files: Array<{ path: string; content: string }> = [
    { path: `${base}/${mainFilename}`,            content: dailyMain },        // 总：日结论
    { path: `${base}/Digest/${date}.md`,       content: digestText },       // 分：详细摘要
    { path: `${base}/Feed/${date}.md`,         content: feedMD },           // 分：原始数据
    { path: `${base}/Thinking/${date}.md`,     content: thinkingText },     // 分：反思问题
  ];

  // Atomic notes — one per opinion (skip invalid ones)
  for (const op of opinions) {
    if (!op.title || !op.coreClaim) {
      console.warn('[aba] Skipping malformed opinion:', JSON.stringify(op).slice(0, 200));
      continue;
    }
    const filename = sanitizeFilename(op.title) + '.md';
    const noteContent = [
      '---',
      `date: ${date}`,
      `source: "[[${base}/Digest/${date}|${date} Digest]]"`,
      `author: "${op.source}"`,
      'type: atomic-note',
      `tags: [${op.domain.join(', ')}]`,
      '---',
      '',
      `# ${op.title}`,
      '',
      '## 来源',
      `- ${op.source} (${date})`,
      `- 原文：${op.sourceUrl}`,
      '',
      '## 核心观点',
      op.coreClaim,
      '',
      '## 为什么重要',
      op.whyImportant,
      '',
      '## 影响对象',
      ...op.whoAffected.map(w => `- ${w}`),
      '',
      '## 相关笔记',
      '',
    ].join('\n');
    files.push({ path: `${base}/Notes/${filename}`, content: noteContent });
  }

  return { date, files, opinionCount: opinions.length, digestLength: digestText.length };
}
