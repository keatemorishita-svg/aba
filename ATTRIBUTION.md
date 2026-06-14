# Attribution

## Data Source

AI Builder OS (ABA) 的数据源来自 **follow-builders**，由 [Zara Zhang](https://x.com/zarazhangrui) 创建和维护。

- **项目地址**：[github.com/zarazhangrui/follow-builders](https://github.com/zarazhangrui/follow-builders)
- **许可证**：MIT License
- **核心理念**："Follow builders, not influencers." ——只追踪真正在做事的人。

## 复用的组件

AI Builder OS 直接使用 follow-builders 的以下公共资源：

| 组件 | 来源 | 目的 |
|---|---|---|
| `feed-x.json` | [GitHub raw](https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json) | 26 位 AI builder 的 X/Twitter 动态 |
| `feed-podcasts.json` | [GitHub raw](https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json) | 6 个 AI 播客的最新转录 |
| `feed-blogs.json` | [GitHub raw](https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json) | AI 公司官方博客 |
| `prompts/*.md` | 原始 Prompt 设计 | 摘要风格参考（已针对 Obsidian 输出改编） |

## 原创部分

AI Builder OS 在 follow-builders 基础上新增：

- 观点提取引擎（`prompts/extract-opinions.md`）
- 原子笔记生成（`prompts/generate-atomic-note.md`）
- 反思问题生成（`prompts/generate-questions.md`）
- Obsidian Vault 写入引擎（`aba.js`）
- 多 LLM 提供商支持（DeepSeek / Anthropic / OpenAI）
- 四层知识架构（Feed → Digest → Notes → Thinking）

## 每份生成内容中的署名

所有 AI Builder OS 生成的文件末尾均自动附加数据来源署名和许可证声明。

---

*If you use AI Builder OS, please keep this attribution intact and consider starring [follow-builders](https://github.com/zarazhangrui/follow-builders) on GitHub.*
