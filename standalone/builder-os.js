#!/usr/bin/env node

// ============================================================================
// AI Builder OS (ABA) — Main Engine
// ============================================================================
// 将 AI builders 的一手信息转化为 Obsidian 知识网络。
//
// 五层输出：
//   1. Feed         — 原始数据缓存（无 LLM）
//   2. Digest       — 结构化日报 + 观点提取（LLM Call 1）
//   3. Perspectives — 共识发现 + 六人视角模拟（LLM Call 2）
//   4. Notes        — 原子化知识笔记（LLM Call 3，每个观点一个笔记）
//   5. Thinking     — 每日反思问题 + 行动清单（LLM Call 4）
//
// 用法:
//   node aba.js                     # 使用今天日期运行
//   node aba.js --date 2026-06-07   # 指定日期
//   node aba.js --dry-run           # 只打印，不写文件
//   node aba.js --skip-notes        # 跳过原子笔记生成（更快）
//
// 依赖: Node.js 18+ (内置 fetch), 无外部 npm 依赖
//   API Key: 设置 ANTHROPIC_API_KEY 环境变量
// ============================================================================

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

// -- Paths -------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const USER_DIR = join(homedir(), '.aba');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const PROMPTS_DIR = join(__dirname, 'prompts');
const PERSONAS_DIR = join(__dirname, 'personas');

// Central feeds (from follow-builders — MIT licensed)
const FEEDS = {
  x:        'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json',
  podcasts: 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json',
  blogs:    'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json',
};

// Official company RSS feeds (老板视角 — 公司官方公告)
const RSS_FEEDS = [
  { url: 'https://openai.com/blog/rss.xml',          source: 'OpenAI' },
  { url: 'https://machinelearning.apple.com/rss.xml', source: 'Apple ML' },
];

// -- CLI arg parsing ---------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { date: null, dryRun: false, skipNotes: false, verbose: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--date':       opts.date = args[++i]; break;
      case '--dry-run':    opts.dryRun = true; break;
      case '--skip-notes': opts.skipNotes = true; break;
      case '--verbose':    opts.verbose = true; break;
      case '--help':
        console.log(`AI Builder OS (ABA) — AI Builders to Obsidian Knowledge Network
Usage: node aba.js [options]
  --date <YYYY-MM-DD>   Target date (default: today)
  --dry-run             Print output, don't write files
  --skip-notes          Skip atomic note generation (faster)
  --verbose             Verbose logging
  --help                Show this help`);
        process.exit(0);
    }
  }
  return opts;
}

// -- Utilities ---------------------------------------------------------------

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function log(msg, opts) {
  console.log(`[aba] ${msg}`);
}

function verbose(msg, opts) {
  if (opts.verbose) console.log(`  [verbose] ${msg}`);
}

async function fetchJSON(url, opts) {
  verbose(`Fetching ${url}`, opts);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchRSSFeeds(opts) {
  const results = [];
  for (const feed of RSS_FEEDS) {
    try {
      const items = await fetchRSS(feed.url, feed.source, opts);
      results.push(...items);
    } catch (err) {
      console.warn(`[ABA] RSS fetch failed for ${feed.source}:`, err.message);
    }
  }
  return results;
}

async function fetchRSS(url, source, opts) {
  verbose(`Fetching RSS: ${source}`, opts);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
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
    if (items.filter(i => i.source === source).length >= 5) break;
  }
  return items;
}

function extractTag(block, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : '';
}

function extractLink(block) {
  let match = block.match(/<link>([^<]*)<\/link>/i);
  if (match) return match[1].trim();
  match = block.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i);
  return match ? match[1].trim() : '';
}

function decodeXML(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function loadPrompt(name) {
  // Priority 1: user custom (~/.aba/prompts/<name>.md)
  const userPath = join(USER_DIR, 'prompts', `${name}.md`);
  if (existsSync(userPath)) return readFile(userPath, 'utf-8');

  // Priority 2: shipped with the script
  const localPath = join(PROMPTS_DIR, `${name}.md`);
  if (existsSync(localPath)) return readFile(localPath, 'utf-8');

  throw new Error(`Prompt not found: ${name}.md (looked in ${USER_DIR}/prompts and ${PROMPTS_DIR})`);
}

async function loadPersona(slug) {
  // Priority 1: user custom (~/.aba/personas/<slug>.md)
  const userPath = join(USER_DIR, 'personas', `${slug}.md`);
  if (existsSync(userPath)) return readFile(userPath, 'utf-8');

  // Priority 2: shipped with the script
  const localPath = join(PERSONAS_DIR, `${slug}.md`);
  if (existsSync(localPath)) return readFile(localPath, 'utf-8');

  throw new Error(`Persona not found: ${slug}.md (looked in ${USER_DIR}/personas and ${PERSONAS_DIR})`);
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

// -- LLM Provider Config ----------------------------------------------------

// Provider presets — add new providers here.
// Each provider: { apiKeyEnv, endpoint, buildRequest(body), extractText(response) }
const LLM_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',

    buildRequest({ model, maxTokens, temperature, system, user }) {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });
      return {
        model: model || 'deepseek-chat',
        max_tokens: maxTokens,
        temperature,
        messages,
      };
    },

    extractText(data) {
      // OpenAI-compatible: { choices: [{ message: { content: "..." } }] }
      if (data.choices && data.choices[0]?.message?.content) {
        return data.choices[0].message.content;
      }
      throw new Error(`Unexpected DeepSeek response format: ${JSON.stringify(data).slice(0, 200)}`);
    },

    buildHeaders(apiKey) {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
    },
  },

  anthropic: {
    name: 'Anthropic Claude',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-6',
    endpoint: 'https://api.anthropic.com/v1/messages',

    buildRequest({ model, maxTokens, temperature, system, user }) {
      return {
        model: model || 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }],
      };
    },

    extractText(data) {
      if (data.content) {
        return data.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
      }
      throw new Error(`Unexpected Anthropic response format: ${JSON.stringify(data).slice(0, 200)}`);
    },

    buildHeaders(apiKey) {
      return {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
    },
  },

  // OpenAI and any OpenAI-compatible (Ollama, Groq, etc.)
  openai: {
    name: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    endpoint: 'https://api.openai.com/v1/chat/completions',

    buildRequest({ model, maxTokens, temperature, system, user }) {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });
      return {
        model: model || 'gpt-4o',
        max_tokens: maxTokens,
        temperature,
        messages,
      };
    },

    extractText(data) {
      if (data.choices && data.choices[0]?.message?.content) {
        return data.choices[0].message.content;
      }
      throw new Error(`Unexpected OpenAI response format: ${JSON.stringify(data).slice(0, 200)}`);
    },

    buildHeaders(apiKey) {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
    },
  },
};

// -- LLM Call ----------------------------------------------------------------

async function callLLM({ system, user, temperature = 0.5, maxTokens = 4000 }, opts) {
  // Read provider from env or config, default to deepseek
  const providerName = process.env.ABA_PROVIDER || 'deepseek';
  const provider = LLM_PROVIDERS[providerName];

  if (!provider) {
    throw new Error(
      `Unknown LLM provider: "${providerName}". Supported: ${Object.keys(LLM_PROVIDERS).join(', ')}`
    );
  }

  // Resolve API key: check provider-specific env, then generic LLM_API_KEY
  const apiKey = process.env[provider.apiKeyEnv] || process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error(
      `${provider.apiKeyEnv} not set.\n` +
      `  PowerShell: $env:${provider.apiKeyEnv} = "sk-..."\n` +
      `  Bash:      export ${provider.apiKeyEnv}=sk-...\n` +
      `Or set LLM_API_KEY for any provider.`
    );
  }

  const model = process.env.ABA_MODEL || provider.defaultModel;
  verbose(`Calling ${provider.name} API [${model}] (system: ${system.length}c, user: ${user.length}c, maxTokens: ${maxTokens})`, opts);

  const body = provider.buildRequest({ model, maxTokens, temperature, system, user });
  const headers = provider.buildHeaders(apiKey);

  // If user set a custom endpoint (e.g. local Ollama), use it
  const endpoint = process.env.ABA_ENDPOINT || provider.endpoint;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errDetail = errText;
    try {
      const errJson = JSON.parse(errText);
      errDetail = errJson.error?.message || errJson.message || errText;
    } catch {}
    throw new Error(
      `${provider.name} API error ${res.status}: ${errDetail.slice(0, 300)}`
    );
  }

  const data = await res.json();
  const text = provider.extractText(data);

  verbose(`LLM response: ${text.length} characters`, opts);
  return text;
}

// -- Phase 1: Feed Generation (no LLM) ---------------------------------------

function generateFeed(data, date) {
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

  // X/Twitter
  if (data.x && data.x.length > 0) {
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
          ''
        );
      }
    }
  }

  // Podcasts
  if (data.podcasts && data.podcasts.length > 0) {
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

  // Blogs
  if (data.blogs && data.blogs.length > 0) {
    lines.push('---', '', '## 📝 官方博客', '');
    for (const blog of data.blogs) {
      lines.push(
        `### ${blog.title || blog.name || 'Untitled'}`,
        '',
        `- **来源**: ${blog.source || blog.name || ''}`,
        `- **链接**: [原文](${blog.url})`,
        '',
      );
    }
  }

  return lines.join('\n');
}

// -- Phase 2: Digest Generation (LLM Call 1) ---------------------------------

async function generateDigest(data, prompts, config, date, opts) {
  log('Phase 2: Generating structured digest...', opts);

  // Assemble the system prompt
  const systemPrompt = [
    prompts.digest_intro,
    '',
    '---',
    '',
    '## Content Summarization Rules',
    '',
    '### For Tweets:',
    prompts.summarize_tweets,
    '',
    '### For Podcasts:',
    prompts.summarize_podcast,
    '',
    '### For Blogs:',
    prompts.summarize_blogs,
    '',
    '### For Translation:',
    prompts.translate,
    '',
    '---',
    '',
    '## Opinion Extraction (CRITICAL)',
    prompts.extract_opinions,
  ].join('\n');

  // Assemble the user content
  const contentSummary = buildContentSummary(data);
  const langInstruction = getLanguageInstruction(config.language);

  const userPrompt = [
    `Today's date: ${date}`,
    `Language: ${config.language} (${langInstruction})`,
    '',
    '## Raw Content to Process',
    '',
    contentSummary,
    '',
    '---',
    '',
    '## Output Format Requirements',
    '',
    'Generate the digest with these sections in order:',
    '',
    '1. **Header**: "AI Builders Digest — [Date]"',
    '2. **今日概览 / Overview**: 3-5 key themes today (2-3 sentences each)',
    '3. **🔑 关键观点 / Key Opinions**: For each substantive opinion found:',
    '   - Use `### [Author Name] — [One-Line Claim]` as heading',
    '   - Include: **类型** / **领域** / **一句话** / **核心观点** / **为什么重要** / **影响对象** / **原文**',
    '4. **🎙️ 播客要点 / Podcast Highlights** (if any)',
    '5. **📝 博客长文 / Blog Posts** (if any)',
    '',
    '## CRITICAL RULES',
    '- EVERY claim MUST have a source URL. No URL = do not include.',
    '- NEVER fabricate quotes or opinions. Only use content from the provided data.',
    '- For each opinion, tag it with a type: `paradigm_shift`, `prediction`, `contrarian_take`, `framework`, `product_insight`, or `market_signal`.',
    '- Generate the digest in the requested language.',
    '- Do NOT use @ handles. Use full names with roles.',
    '',
    'At the very end of the digest, append a JSON block with structured opinion data:',
    '```opinions_json',
    '[',
    '  {',
    '    "id": "slug-version-of-title",',
    '    "title": "Core Concept as Noun Phrase (English)",',
    '    "type": "market_signal|paradigm_shift|prediction|contrarian_take|framework|product_insight",',
    '    "domain": ["tag1", "tag2"],',
    '    "oneLiner": "One sentence summary in the output language",',
    '    "coreClaim": "Detailed claim paragraph",',
    '    "whyImportant": "Why this matters",',
    '    "whoAffected": ["role1", "role2"],',
    '    "source": "Author Name",',
    '    "sourceUrl": "https://..."',
    '  }',
    ']',
    '```',
  ].join('\n');

  // Call LLM
  const digestText = await callLLM({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: 8000,
    temperature: 0.4,
  }, opts);

  return digestText;
}

// -- Phase 3: Perspectives + Consensus (LLM Call 2) --------------------------

async function generatePerspectives(digestText, opinions, personas, prompts, config, date, opts) {
  log('Phase 3: Generating consensus + 6 builder perspectives...', opts);

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
    `Language: ${config.language}`,
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
  }, opts);
}

// -- Phase 4: Atomic Note Generation (LLM Call 3) ----------------------------

function parseOpinionsFromDigest(digestText) {
  // Extract the opinions_json block from the digest
  const match = digestText.match(/```opinions_json\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    console.error('  [warn] Failed to parse opinions JSON:', err.message);
    return [];
  }
}

async function generateAtomicNotes(opinions, digestDate, prompts, config, opts) {
  if (!opinions || opinions.length === 0) {
    log('No opinions found in digest, skipping atomic notes.', opts);
    return [];
  }

  log(`Phase 4: Generating ${opinions.length} atomic notes...`, opts);
  const notes = [];

  for (const op of opinions) {
    verbose(`  Generating note: ${op.title}`, opts);

    const userPrompt = [
      `Based on this opinion from the AI Builders Digest (${digestDate}), create an atomic note.`,
      '',
      '## Opinion Data',
      '```json',
      JSON.stringify(op, null, 2),
      '```',
      '',
      'Generate a complete atomic note following the structure in your system prompt.',
      `Language: ${config.language}`,
    ].join('\n');

    try {
      const noteText = await callLLM({
        system: prompts.generate_atomic_note,
        user: userPrompt,
        maxTokens: 2000,
        temperature: 0.3,
      }, opts);
      notes.push({ opinion: op, content: noteText });
    } catch (err) {
      console.error(`  [error] Failed to generate note for "${op.title}":`, err.message);
      // Continue with other notes
    }
  }

  return notes;
}

// -- Phase 5: Thinking Generation (LLM Call 4) -------------------------------

async function generateThinking(digestText, digestDate, opinions, prompts, config, opts) {
  log('Phase 5: Generating daily thinking...', opts);

  // Extract the main digest content (without the opinions JSON block)
  const mainContent = digestText.replace(/```opinions_json[\s\S]*?```/, '').trim();

  // Build a concise summary of key signals for the question generator
  const signalSummary = opinions
    .map(o => `- [${o.type}] ${o.oneLiner} (${o.source})`)
    .join('\n');

  const userPrompt = [
    `Today's date: ${digestDate}`,
    `Language: ${config.language}`,
    '',
    '## Today\'s Key Signals',
    signalSummary,
    '',
    '## Full Digest Content',
    mainContent.slice(0, 8000), // Truncate if very long
    '',
    '---',
    '',
    'Generate the Daily Thinking document following the structure in your system prompt.',
    'Make questions specific to today\'s content, not generic.',
    'Every question should reference a specific claim or builder from today.',
  ].join('\n');

  const thinkingText = await callLLM({
    system: prompts.generate_questions,
    user: userPrompt,
    maxTokens: 3000,
    temperature: 0.6, // Slightly higher for creative questions
  }, opts);

  return thinkingText;
}

// -- Phase 6: Index MOC Update -----------------------------------------------

function generateIndexUpdate(date, notes, digestDate) {
  // Map of Content (MOC) — grows over time
  const noteLinks = notes
    .map(n => `- [[${n.opinion.title}]] — ${n.opinion.oneLiner}`)
    .join('\n');

  return [
    '---',
    `updated: ${date}`,
    'type: index',
    '---',
    '',
    '# 🏗️ AI Builder OS (ABA) — Index',
    '',
    '## 最近更新',
    `- [[AI Builder OS/Digest/${digestDate}|${digestDate} Digest]] — ${notes.length} 个观点`,
    '',
    '## 本期观点索引',
    noteLinks,
    '',
    '## 按类型浏览',
    '- [[#paradigm_shift|范式变化]]',
    '- [[#prediction|预测]]',
    '- [[#contrarian_take|反共识]]',
    '- [[#framework|思维框架]]',
    '- [[#product_insight|产品洞察]]',
    '- [[#market_signal|市场信号]]',
    '',
    '## 按领域浏览',
    '(自动积累中)',
    '',
  ].join('\n');
}

// -- File Writing ------------------------------------------------------------

async function writeToVault(vaultPath, relPath, content, opts) {
  const fullPath = join(vaultPath, relPath);
  if (opts.dryRun) {
    console.log(`  [dry-run] Would write: ${fullPath} (${content.length} chars)`);
    return;
  }
  await ensureDir(dirname(fullPath));
  await writeFile(fullPath, content, 'utf-8');
  verbose(`  Wrote: ${fullPath}`, opts);
}

// -- Helpers -----------------------------------------------------------------

function buildFactsSection(data) {
  const lines = [];

  if (data.x && data.x.length > 0) {
    lines.push('### 𝕏 推文', '');
    for (const builder of data.x) {
      const role = builder.bio ? ` (${builder.bio.split('\n')[0].slice(0, 60)})` : '';
      const tweetCount = builder.tweets.length;
      const topTweet = builder.tweets[0];
      lines.push(
        `**${builder.name}**${role} — ${tweetCount} 条`,
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

  if (data.podcasts && data.podcasts.length > 0) {
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

  if (data.blogs && data.blogs.length > 0) {
    lines.push('### 📝 博客', '');
    for (const blog of data.blogs) {
      lines.push(
        `**${blog.title || 'Untitled'}**`,
        `[原文](${blog.url})`,
        '',
      );
    }
  }

  return lines.join('\n');
}

function buildContentSummary(data) {
  const parts = [];

  // X/Twitter
  parts.push('## X / Twitter Posts', '');
  for (const builder of data.x || []) {
    const role = builder.bio ? ` (${builder.bio.split('\n')[0].trim()})` : '';
    parts.push(`### ${builder.name}${role}`);
    parts.push(`Handle: ${builder.handle}`);
    for (const tweet of builder.tweets) {
      parts.push(
        `- [${tweet.createdAt?.slice(0, 16) || '?'}] ${tweet.text}`,
        `  URL: ${tweet.url}`,
        `  Likes: ${tweet.likes}, Retweets: ${tweet.retweets}, Replies: ${tweet.replies}`,
        tweet.isQuote ? `  [Quote Tweet]` : '',
      );
    }
    parts.push('');
  }

  // Podcasts
  if (data.podcasts && data.podcasts.length > 0) {
    parts.push('## Podcast Episodes', '');
    for (const ep of data.podcasts) {
      const transcriptPreview = (ep.transcript || '').slice(0, 6000);
      parts.push(
        `### ${ep.name} — ${ep.title}`,
        `URL: ${ep.url}`,
        `Published: ${ep.publishedAt?.slice(0, 10) || '?'}`,
        '',
        'Transcript (first 6000 chars):',
        transcriptPreview,
        transcriptPreview.length < (ep.transcript || '').length ? '...(truncated)' : '',
        '',
      );
    }
  }

  // Blogs
  if (data.blogs && data.blogs.length > 0) {
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

function getLanguageInstruction(lang) {
  switch (lang) {
    case 'zh': return 'Generate the entire output in Chinese (Simplified). Translate all English content to Chinese.';
    case 'bilingual': return 'Generate bilingual output: each paragraph in English followed by its Chinese translation. Interleave paragraph by paragraph.';
    case 'en':
    default: return 'Generate the entire output in English.';
  }
}

function sanitizeFilename(title) {
  return title
    .replace(/[<>:"/\\|?*]/g, '')  // Remove invalid Windows filename chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100); // Limit length
}

// -- Main --------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  const date = opts.date || today();

  console.log('═'.repeat(60));
  console.log(`  AI Builder OS (ABA) — ${date}`);
  console.log('═'.repeat(60));
  log(`Mode: ${opts.dryRun ? 'DRY RUN (no files written)' : 'LIVE'}`);

  // 0. Load config
  log('Loading configuration...');
  let config = {
    vaultPath: join(homedir(), 'ObsidianVault'),
    language: 'zh',
  };
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
    log(`  Config loaded: vault=${config.vaultPath}, language=${config.language}`);
  } else {
    log('  No config found, using defaults. Run onboarding to customize.');
    // Save default config
    await ensureDir(USER_DIR);
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  // 1. Fetch central feeds + RSS
  log('Phase 1: Fetching central feeds + official company news...');
  let feedX, feedPodcasts, feedBlogs, rssItems;
  try {
    [feedX, feedPodcasts, feedBlogs, rssItems] = await Promise.all([
      fetchJSON(FEEDS.x, opts),
      fetchJSON(FEEDS.podcasts, opts),
      fetchJSON(FEEDS.blogs, opts),
      fetchRSSFeeds(opts),
    ]);
  } catch (err) {
    console.error('Fatal: Could not fetch feeds:', err.message);
    console.error('Check your internet connection and try again.');
    process.exit(1);
  }

  const data = {
    x: feedX?.x || [],
    podcasts: feedPodcasts?.podcasts || [],
    blogs: feedBlogs?.blogs || [],
    rss: rssItems || [],
    stats: {
      totalTweets: (feedX?.x || []).reduce((s, b) => s + (b.tweets?.length || 0), 0),
      podcastEpisodes: (feedPodcasts?.podcasts || []).length,
      blogPosts: (feedBlogs?.blogs || []).length,
      rssItems: (rssItems || []).length,
    },
  };

  log(`  Fetched: ${data.stats.totalTweets} tweets, ${data.stats.podcastEpisodes} podcasts, ${data.stats.rssItems} official news, ${data.stats.blogPosts} blogs`);

  if (data.stats.totalTweets === 0 && data.stats.podcastEpisodes === 0 && data.stats.rssItems === 0 && data.stats.blogPosts === 0) {
    log('No new content today. Nothing to generate.');
    process.exit(0);
  }

  // 2. Load prompts
  log('Loading prompts...');
  const promptNames = [
    'digest-intro', 'summarize-tweets', 'summarize-podcast', 'summarize-blogs',
    'translate', 'extract-opinions', 'generate-atomic-note', 'generate-questions',
    'find-consensus',
  ];
  const prompts = {};
  for (const name of promptNames) {
    try {
      prompts[name.replace(/-/g, '_')] = await loadPrompt(name);
    } catch (err) {
      console.error(`  [warn] ${err.message}`);
    }
  }

  // 3. Load personas
  log('Loading personas...');
  const personaSlugs = ['dario-amodei', 'elon-musk', 'sam-altman', 'demis-hassabis', 'andrej-karpathy', 'aravind-srinivas'];
  const personas = {};
  for (const slug of personaSlugs) {
    try {
      personas[slug] = await loadPersona(slug);
    } catch (err) {
      console.error(`  [warn] ${err.message}`);
    }
  }
  if (Object.keys(personas).length === 0) {
    console.error('Fatal: No personas loaded. Cannot generate perspectives.');
    process.exit(1);
  }

  // 4. Generate Feed (no LLM)
  log('Generating Feed...');
  let feedMD = generateFeed(data, date);

  // 5. Generate Digest (LLM Call 1)
  let digestText;
  try {
    digestText = await generateDigest(data, prompts, config, date, opts);
  } catch (err) {
    console.error('Fatal: Digest generation failed:', err.message);
    console.error('Check your API key (DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / LLM_API_KEY) and internet connection.');
    process.exit(1);
  }

  // 6. Parse opinions
  const opinions = parseOpinionsFromDigest(digestText);
  log(`  Extracted ${opinions.length} structured opinions from digest.`);

  // 7. Generate Perspectives + Consensus (LLM Call 2)
  let perspectivesText;
  try {
    perspectivesText = await generatePerspectives(digestText, opinions, personas, prompts, config, date, opts);
  } catch (err) {
    console.error('Fatal: Perspectives generation failed:', err.message);
    process.exit(1);
  }

  // 8. Generate Atomic Notes (LLM Call 3, skip if --skip-notes or no opinions)
  let notes = [];
  if (!opts.skipNotes && opinions.length > 0) {
    notes = await generateAtomicNotes(opinions, date, prompts, config, opts);
    log(`  Generated ${notes.length} atomic notes.`);
  } else if (opts.skipNotes) {
    log('  Skipping atomic notes (--skip-notes).');
  }

  // 7. Generate Thinking (LLM Call 3)
  let thinkingText;
  try {
    thinkingText = await generateThinking(digestText, date, opinions, prompts, config, opts);
  } catch (err) {
    console.error('  [error] Thinking generation failed:', err.message);
    thinkingText = `# Daily Thinking — ${date}\n\n_(Generation failed: ${err.message})_\n\n## 今日行动\n- [ ] \n- [ ] \n`;
  }

  // 9. Append attribution footer (programmatic — not dependent on LLM)
  const disclaimerBlock = [
    '',
    '> ⚠️ **免责声明**：本内容中的「六人视角」为 AI 基于各位 Builder 的公开言论、已知思维模式和公开发表的观点进行的模拟推演，不代表其本人真实观点，也非其实际发言。所有原始信息均来自公开的 X/Twitter 推文、YouTube 播客转录和官方博客。本工具仅供个人学习与思考使用，不构成任何投资或商业建议。',
  ].join('\n');

  const attributionFooter = [
    '',
    '---',
    '',
    '*📡 数据来源：[follow-builders](https://github.com/zarazhangrui/follow-builders) by [Zara Zhang](https://x.com/zarazhangrui)*',
    '*🔧 本地 Remix：[AI Builder OS](https://github.com/zarazhangrui/follow-builders) · Follow builders, not influencers.*',
  ].join('\n');

  digestText = digestText.replace(/```opinions_json[\s\S]*?```\s*$/, '').trimEnd() + '\n' + attributionFooter;
  feedMD = feedMD.trimEnd() + '\n' + attributionFooter;
  perspectivesText = perspectivesText.trimEnd() + '\n' + disclaimerBlock + '\n' + attributionFooter;
  thinkingText = thinkingText.trimEnd() + '\n' + attributionFooter;

  // Build the main daily file (总): perspectives + facts summary + cross-references
  const factsSection = buildFactsSection(data);
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const mainFilename = `今日共识 ${date} ${timeStr}.md`;

  const dailyMain = [
    perspectivesText,
    '',
    '---',
    '',
    '## 📡 今日素材',
    '',
    `> 共 ${data.stats.totalTweets} 条推文 · ${data.stats.podcastEpisodes} 期播客 · ${data.stats.blogPosts} 篇博客`,
    `> 详细摘要：[[AI Builder OS/Digest/${date}|${date} Digest]] · 原始数据：[[AI Builder OS/Feed/${date}|Feed]]`,
    '',
    factsSection,
  ].join('\n');

  // 10. Write all files to vault
  log('Writing to vault...');
  const vaultBase = join(config.vaultPath, 'AI Builder OS');

  const files = [
    { path: join(vaultBase, mainFilename), content: dailyMain, label: 'Daily Main (共识+视角)' },
    { path: join(vaultBase, 'Feed', `${date}.md`), content: feedMD, label: 'Feed' },
    { path: join(vaultBase, 'Digest', `${date}.md`), content: digestText, label: 'Digest' },
    { path: join(vaultBase, 'Thinking', `${date}.md`), content: thinkingText, label: 'Thinking' },
  ];

  // Add index update
  const indexContent = generateIndexUpdate(date, notes, date);
  files.push({ path: join(vaultBase, 'Index', 'README.md'), content: indexContent, label: 'Index' });

  // Add atomic notes
  for (const note of notes) {
    const filename = sanitizeFilename(note.opinion.title) + '.md';
    files.push({
      path: join(vaultBase, 'Notes', filename),
      content: note.content,
      label: `Note: ${note.opinion.title}`,
    });
  }

  for (const file of files) {
    await writeToVault(config.vaultPath, file.path.replace(config.vaultPath, '').replace(/^[\\/]/, ''), file.content, opts);
  }

  // 11. Summary
  console.log('');
  console.log('═'.repeat(60));
  console.log(`  ✅ AI Builder OS (ABA) — ${date} — Complete`);
  console.log(`     Feed:         ${feedMD.length} chars`);
  console.log(`     Digest:       ${digestText.length} chars (${opinions.length} opinions)`);
  console.log(`     Perspectives: ${perspectivesText.length} chars (共识 + 六人视角)`);
  console.log(`     Notes:        ${notes.length} atomic notes`);
  console.log(`     Thinking:     ${thinkingText.length} chars`);
  console.log(`     📄 Main:      ${mainFilename}`);
  console.log(`     ${opts.dryRun ? '(DRY RUN — no files written)' : `Vault: ${config.vaultPath}\\AI Builder OS\\`}`);
  console.log('═'.repeat(60));

  if (opts.dryRun) {
    // In dry-run, print the main daily file (共识+视角) to console for review
    console.log('\n--- MAIN FILE PREVIEW (共识+视角, first 2000 chars) ---\n');
    console.log(dailyMain.slice(0, 2000));
    console.log('\n... (truncated) ...\n');
  }
}

main().catch(err => {
  console.error('\n❌ AI Builder OS (ABA) failed:', err.message);
  if (process.env.ABA_DEBUG) console.error(err.stack);
  process.exit(1);
});
