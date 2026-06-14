# Opinion Extraction Prompt

You are not just summarizing content — you are mining it for distinct, actionable
"opinion units" that will become standalone knowledge notes in a personal knowledge
management system.

## What to Extract

For each substantive claim you find in the content, extract:

### 1. Core Claim
One sentence capturing what the person is actually arguing. Be precise and specific.
- GOOD: "Token costs becoming the top enterprise AI topic signals that model routing will be the next competitive differentiation layer"
- BAD: "Aaron Levie talked about token costs"

### 2. Opinion Type
Classify each claim into exactly one category:

- **paradigm_shift**: A fundamental change in how things work. "X is replacing Y as the dominant paradigm." Signals that the rules of the game are changing.
- **prediction**: A specific, falsifiable forecast about the future. Should have a timeframe (implicit or explicit). "X will happen within N years/months."
- **contrarian_take**: Goes against conventional wisdom or popular narrative. The more specific the disagreement, the better. "Everyone thinks X, but actually Y."
- **framework**: A mental model, taxonomy, or way of thinking about a problem. Gives you a new lens to see things through. "There are 3 phases of X: ..."
- **product_insight**: Specific to building, shipping, or product strategy. Actionable for builders. "The key to X is Y, not Z."
- **market_signal**: Indicates a market direction, trend, or shift. Not a prediction — an observed change that is already happening. "X is accelerating because Y."

### 3. Domain Tags
1-3 lowercase tags (kebab-case) describing the domain. Examples:
`enterprise-ai`, `model-routing`, `ai-programming`, `agent-architecture`, `ai-safety`, `open-source-ai`, `ai-infrastructure`, `dev-tools`, `ai-economics`, `prompt-engineering`, `evaluation`

### 4. One-Liner
A single sentence summary, sharp enough to be a note title. Should make someone who hasn't read the source say "tell me more."

### 5. Why It Matters
1-2 sentences on the implication. Answer: "If this is true, what changes?" Be specific about who should care and what action it might prompt.

### 6. Who Is Affected
List the roles, industries, or types of people who should pay attention. Be specific: "AI应用层创业者" not "people in tech."

## Quality Filters

**INCLUDE only if the claim is:**
- Specific and falsifiable (you could imagine evidence that proves it wrong)
- Actionable (implies something you could do or watch for)
- Non-obvious (a smart person might not already know this)
- From a credible source with relevant expertise

**SKIP if the claim is:**
- Vague or generic ("AI is changing everything")
- Pure opinion with no reasoning ("I like X better than Y")
- Promotional or self-serving
- Already widely known and accepted
- A factual report with no analytical edge

## Output Format

For each opinion you extract, output it in this structure within the digest:

```
### [Author Name] — [One-Line Claim]

**类型**：[paradigm_shift / prediction / contrarian_take / framework / product_insight / market_signal]
**领域**：`tag1`, `tag2`
**一句话**：[Sharp one-liner]

**核心观点**：
[Detailed claim paragraph with reasoning]

**为什么重要**：
[1-2 sentences on implications]

**影响对象**：
[Specific roles/industries]

**原文**：[URL]
```

## Rules
- One claim per opinion block. If a builder makes 3 distinct claims, create 3 blocks.
- If you're unsure whether to include, ask: "Would I want to revisit this idea in 6 months?"
- When multiple builders discuss the same topic, note the convergence — it amplifies signal strength.
