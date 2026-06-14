# Consensus Discovery Prompt

After generating all 6 Builder perspectives, your final task is to identify
**consensus** — where do multiple Builders with fundamentally different thinking
styles independently converge on the same judgment?

## Why Consensus Matters

Disagreement is everywhere. Any two smart people can disagree — it's easy and
it's expected. But when three or more Builders with **different cognitive models**
independently reach the same conclusion, that's a signal worth paying attention to.

Consensus among diverse thinkers is how industry consensus begins.

## How to Find Consensus

Scan all 6 perspectives and look for:

### Level 1: Same Direction
Two Builders point in the same general direction. This is a **trend**, not yet a
consensus. Worth noting but not highlighted.

### Level 2: Same Judgment (3 Builders)
Three Builders from different cognitive camps independently say "this matters
and here's why." This is **meaningful consensus** — list it.

### Level 3: Same Judgment + Same Reasoning (4+ Builders)
Four or more Builders not only agree on WHAT matters, but their reasoning
converges from different angles. This is **industry consensus in formation** —
highlight it prominently.

## Output Format

At the very end of the 6-perspective digest, append:

```markdown
---

## 🤝 今日共识

### 共识 1：[共识主题]
**达成者**：[Builder A]、[Builder B]、[Builder C]（+ [Builder D] 如有）
**重合点**：[他们具体在哪个判断上一致？用一句话说清楚]
**各自角度**：
- [Builder A] 从 [ta的认知锚点] 的角度认为……
- [Builder B] 从 [ta的认知锚点] 的角度同样认为……
- [Builder C] 基于 [ta的认知锚点] 也得出了类似结论……
**信号强度**：[🔴 极强 (4+) / 🟡 强 (3) / 🟢 值得关注 (2+ 方向一致)]

### 共识 2：[如有]
...

---
*共识算法：六个不同认知模型的人，在独立分析同一信息后，是否在某个判断上达成了对齐。差异是常态，共识才是信号。*
```

## Rules

- Only report consensus when 3+ Builders with DIFFERENT cognitive models agree.
  Musk + Karpathy both being technical doesn't count as diverse consensus — look
  for combinations like Altman + Musk + Dario, or Karpathy + Aravind + Hassabis.
- If there is no consensus of 3+ today, say so honestly:
  `今日无显著共识——六位 Builder 的判断较为分散，尚无三人以上达成同一判断。`
- NEVER fabricate consensus. If the perspectives genuinely diverge, report that.
- The value of consensus is inversely proportional to how similar the thinkers are.
  Consensus between Altman and Aravind (both product-minded) is weaker than
  consensus between Musk and Dario (opposite ends of the spectrum).
- Each consensus entry MUST reference specific claims from the digest, not
  vague generalities like "AI is important."
