# Atomic Note Generation Prompt

You are creating an **atomic note** — a single, self-contained knowledge unit for
a personal Obsidian vault. An atomic note captures ONE idea in a way that:
1. Can be understood without reading the original source
2. Can be linked to other notes to form a knowledge network
3. Retains its value months or years later

## Note Structure

Generate the note with EXACTLY this structure:

```markdown
---
date: [digest date]
source: "[[AI Builder OS/Digest/[date]|[date] Digest]]"
author: "[Author Name]"
type: atomic-note
tags: [kebab-case-tags]
---

# [Core Concept as a Noun Phrase]

## 来源
- [Author Name], [Role/Company] ([Date])
- 原文：[sourceUrl]

## 核心观点
[One paragraph restating the claim in your own words. Be precise and concrete.
This should be understandable to someone who hasn't read the original.]

## 扩展解释
[2-3 paragraphs that:
- Explain the concept for an intelligent non-specialist
- Provide context: what led to this, what does it connect to?
- Note implications, edge cases, or limits of the claim
- If the claim is a prediction, what would falsify it?
- If it's a framework, what are its boundary conditions?]

## 相关笔记
- [[Suggested Related Concept 1]]
- [[Suggested Related Concept 2]]
- [[Suggested Related Concept 3]]

## 💭 我的思考
-
-
```

## Writing Guidelines

### Title
- Use a noun phrase, not a sentence
- Capture the CONCEPT, not the person
- GOOD: "Model Routing as Competitive Moat"
- BAD: "Aaron Levie Says Token Costs Matter"

### Core Claim (核心观点)
- Restate the argument in its strongest, most charitable form
- Include the reasoning, not just the conclusion
- If the original uses jargon, translate it

### Extended Explanation (扩展解释)
- Start with the "why now" — what makes this timely?
- Explain concepts a curious non-expert wouldn't know
- Connect to broader trends or historical parallels
- Mention who disagrees and why (if known)
- End with a forward-looking note: what to watch for

### Related Notes (相关笔记)
- Suggest 2-4 wikilinks to related concepts
- These are HYPOTHETICAL — they may not exist yet (that's fine)
- Link to ideas, not people
- GOOD: [[Token Cost Economics]], [[Enterprise AI Adoption]]
- BAD: [[Aaron Levie]], [[June 2026]]

### My Thoughts (我的思考)
- Leave EMPTY with placeholder dashes
- This section is for the HUMAN to fill in later
- Do NOT generate any content here

## Tone
- Sharp and precise, like a good textbook
- Assume the reader is smart but not specialized in this exact domain
- No cheerleading ("this is amazing!"). No cynicism. Just clear thinking.
- Write for your future self who may have forgotten all context

## Golden Rules
1. ONE idea per note. If there are two distinct claims, make two notes.
2. A good note is one you'd be happy to rediscover in 2 years.
3. Links to other concepts are more valuable than perfect prose.
4. The empty "我的思考" section is a feature, not a bug — it invites engagement.
