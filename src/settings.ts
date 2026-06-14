// ============================================================================
// AI Builder OS (ABA) — Settings Tab
// ============================================================================

import { App, PluginSettingTab, Setting } from 'obsidian';
import type BuilderOSPlugin from './main';

export class BuilderOSSettingTab extends PluginSettingTab {
  plugin: BuilderOSPlugin;

  constructor(app: App, plugin: BuilderOSPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl('h2', { text: 'AI Builder OS (ABA) — 设置' });

    // -- API Key -------------------------------------------------------------
    new Setting(containerEl)
      .setName('API Key')
      .setDesc('DeepSeek / OpenAI / Anthropic 的 API Key。仅存储在本地，不上传。')
      .addText(text => text
        .setPlaceholder('sk-...')
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        }));

    // -- Provider ------------------------------------------------------------
    new Setting(containerEl)
      .setName('LLM 提供商')
      .setDesc('选择你要使用的大模型接口。')
      .addDropdown(dropdown => dropdown
        .addOption('deepseek', 'DeepSeek（推荐）')
        .addOption('openai', 'OpenAI')
        .addOption('anthropic', 'Anthropic Claude')
        .addOption('custom', '自定义（Ollama / Groq 等）')
        .setValue(this.plugin.settings.provider)
        .onChange(async (value) => {
          this.plugin.settings.provider = value as any;
          await this.plugin.saveSettings();
          this.display(); // refresh to show/hide custom endpoint
        }));

    // -- Custom Endpoint ----------------------------------------------------
    if (this.plugin.settings.provider === 'custom') {
      new Setting(containerEl)
        .setName('自定义 Endpoint')
        .setDesc('OpenAI 兼容的 API 地址。例：http://localhost:11434/v1/chat/completions')
        .addText(text => text
          .setPlaceholder('https://api.example.com/v1/chat/completions')
          .setValue(this.plugin.settings.endpoint)
          .onChange(async (value) => {
            this.plugin.settings.endpoint = value.trim();
            await this.plugin.saveSettings();
          }));
    }

    // -- Model ---------------------------------------------------------------
    new Setting(containerEl)
      .setName('模型')
      .setDesc('留空使用默认模型。')
      .addText(text => text
        .setPlaceholder('deepseek-chat / gpt-4o / claude-sonnet-4-6')
        .setValue(this.plugin.settings.model)
        .onChange(async (value) => {
          this.plugin.settings.model = value.trim();
          await this.plugin.saveSettings();
        }));

    // -- Language ------------------------------------------------------------
    new Setting(containerEl)
      .setName('输出语言')
      .setDesc('日报和视角的输出语言。')
      .addDropdown(dropdown => dropdown
        .addOption('zh', '中文')
        .addOption('en', 'English')
        .addOption('bilingual', '中英对照')
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          this.plugin.settings.language = value as any;
          await this.plugin.saveSettings();
        }));

    // -- Schedule ------------------------------------------------------------
    new Setting(containerEl)
      .setName('每日生成时间')
      .setDesc('格式 HH:MM（北京时间）。')
      .addText(text => text
        .setPlaceholder('06:00')
        .setValue(this.plugin.settings.scheduleTime)
        .onChange(async (value) => {
          this.plugin.settings.scheduleTime = value.trim();
          await this.plugin.saveSettings();
        }));

    // -- Output Folder -------------------------------------------------------
    new Setting(containerEl)
      .setName('输出目录')
      .setDesc('Vault 内的相对路径。')
      .addText(text => text
        .setPlaceholder('AI Builder OS')
        .setValue(this.plugin.settings.outputFolder)
        .onChange(async (value) => {
          this.plugin.settings.outputFolder = value.trim() || 'AI Builder OS';
          await this.plugin.saveSettings();
        }));
  }
}
