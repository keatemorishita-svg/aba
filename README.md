# Builder OS

> **Follow builders, not influencers.**
>
> 将 AI 行业顶尖 Builder 的每日动态，通过六个截然不同的认知模型解读，写入你的 Obsidian 知识网络。
>
> 🔋 **Powered by [follow-builders](https://github.com/zarazhangrui/follow-builders) data** — 数据策展由 [Zara Zhang](https://x.com/zarazhangrui) 提供。

[English](#english) | 中文

---

## 这是什么

每天早上打开 Obsidian，看到六个最聪明的 AI Builder 独立分析昨天发生了什么——他们在哪里达成共识，哪里意见不同。

**核心闭环**：拉取公开 Feed → LLM 提炼观点 → 六人视角模拟 → 发现共识 → 写入 Obsidian。

## 与 follow-builders 的关系

Builder OS 是 follow-builders 的 **Obsidian 集成层**。我们站在 Zara 的肩膀上做了一件事：把「推送给你读」升级为「帮你建立认知」。

| 层 | follow-builders 做的 | Builder OS 新增的 |
|---|---|---|
| **数据** | 策展 26 位 Builder + 6 个播客 + 2 个博客 | — |
| **抓取** | 中央 Feed（X API + Supadata），公开托管 GitHub raw | — |
| **摘要** | 5 个基础 Prompt（摘要 + 翻译） | **优化 + 新增 4 个**：观点提取、原子笔记、反思问题、共识发现 |
| **视角** | — | **6 个 Builder 认知模型**（Dario / Musk / Altman / Hassabis / Karpathy / Aravind） |
| **共识** | — | **3 级共识信号**：3+ 不同认知模型达成同一判断 |
| **输出** | Telegram / Feishu 推送 | **Obsidian 双链知识网络**（总-分-分 结构） |
| **形态** | Agent Skill | **Node.js 脚本 + Obsidian 插件** |

> 详见 [ATTRIBUTION.md](ATTRIBUTION.md)

## 安装

### Obsidian 插件（推荐）

1. Obsidian → 设置 → 第三方插件 → 浏览 → 搜索「Builder OS」
2. 安装并启用
3. 设置中填入 API Key（支持 DeepSeek / OpenAI / Anthropic）

### 手动安装

```bash
cd your-vault/.obsidian/plugins/
git clone https://github.com/zarazhangrui/obsidian-builder-os.git
cd obsidian-builder-os
npm install && npm run build
```

### 独立脚本（不需要 Obsidian）

```bash
git clone https://github.com/zarazhangrui/obsidian-builder-os.git
cd obsidian-builder-os/standalone
# 编辑 config.json → 设置 vaultPath
export DEEPSEEK_API_KEY=sk-...
node builder-os.js
```

## 设置

| 设置项 | 说明 | 默认 |
|---|---|---|
| API Key | DeepSeek / OpenAI / Anthropic | — |
| LLM 提供商 | deepseek / openai / anthropic / custom | `deepseek` |
| 输出语言 | zh / en / bilingual | `zh` |
| 每日生成时间 | HH:MM 本地时间 | `06:00` |
| 输出目录 | Vault 内相对路径 | `AI Builder OS` |

## 输出结构（总-分-分）

```
AI Builder OS/
├── 今日共识 YYYY-MM-DD HHMM.md   ← 总：结论层
│   ├── 🤝 今日共识（3+ Builder 对齐）
│   ├── 🧠 六人视角（按江湖地位排序）
│   └── 📡 今日素材（推文/播客/博客 + 来源链接）
│
├── Digest/        ← 分：详细结构化摘要
├── Feed/          ← 分：原始数据缓存
├── Notes/         ← 分：原子化知识笔记（Graph View 双链）
├── Thinking/      ← 分：每日反思问题
└── Index/         ← 分：知识索引 MOC
```

## 支持的 LLM

| 提供商 | 环境变量 | 默认模型 | 日成本 |
|---|---|---|---|
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` | ¥0.5-1.5 |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` | $1-3 |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` | $2-5 |
| 自定义 | `LLM_API_KEY` + endpoint | 按配置 | — |

## 开发

```bash
git clone https://github.com/zarazhangrui/obsidian-builder-os.git
cd obsidian-builder-os
npm install
npm run dev          # 开发模式（自动 watch）
npm run build        # 生产构建
```

## 项目结构

```
src/
├── main.ts          # 插件入口（命令、定时、设置）
├── engine.ts        # 生成引擎（Orchestration）
├── llm.ts           # LLM 提供商抽象
├── feed.ts          # 中央 Feed 抓取
├── settings.ts      # 设置面板 UI
└── types.ts         # 共享类型
prompts/             # 9 个 Prompt 文件（核心资产）
personas/            # 6 个 Builder 认知模型
standalone/          # 独立 Node.js 脚本（非 Obsidian 用户）
```

## License

MIT © 2026 Builder OS

数据源 [follow-builders](https://github.com/zarazhangrui/follow-builders) 同样采用 MIT License。

---

<a id="english"></a>
## English

### What

Builder OS transforms daily AI builder insights into an Obsidian knowledge network, filtered through six distinct cognitive models — from Dario Amodei's safety-first probabilistic thinking to Elon Musk's first-principles physics.

Every morning, open Obsidian to see what six of the smartest people in AI would think about yesterday's news. Where do they converge? That's your signal.

### Powered by follow-builders

All content is sourced from [follow-builders](https://github.com/zarazhangrui/follow-builders) by Zara Zhang — a curated feed of 26 AI builders on X, 6 top-tier podcasts, and official AI company blogs. See [ATTRIBUTION.md](ATTRIBUTION.md) for full credits.

### Quick Start

```bash
# Obsidian plugin
cd your-vault/.obsidian/plugins/
git clone https://github.com/zarazhangrui/obsidian-builder-os.git
cd obsidian-builder-os && npm install && npm run build

# Standalone script
cd obsidian-builder-os/standalone
export DEEPSEEK_API_KEY=sk-...
node builder-os.js
```

### The Six Builders

| # | Builder | Cognitive Model |
|---|---|---|
| 1 | Dario Amodei | Safety through measurement, probabilistic thinking |
| 2 | Elon Musk | First principles, physics constraints |
| 3 | Sam Altman | Platform timing, compounding scale |
| 4 | Demis Hassabis | AI as scientific discovery tool, 50-year horizon |
| 5 | Andrej Karpathy | Teaching instinct, eval-driven |
| 6 | Aravind Srinivas | Product-market fit, user behavior |

### Consensus > Disagreement

When 3+ builders with **different cognitive models** independently reach the same judgment, it's flagged as a consensus signal. Four or more = approaching industry consensus.
