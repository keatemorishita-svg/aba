// ============================================================================
// AI Builder OS (ABA) — Obsidian Plugin Entry Point
// ============================================================================

import { Notice, Plugin } from 'obsidian';
import { BuilderOSSettingTab } from './settings';
import { runGeneration } from './engine';
import type { BuilderOSSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

export default class BuilderOSPlugin extends Plugin {
  declare settings: BuilderOSSettings;
  private scheduleTimer: number | null = null;

  async onload() {
    await this.loadSettings();

    // Settings tab
    this.addSettingTab(new BuilderOSSettingTab(this.app, this));

    // Ribbon icon
    this.addRibbonIcon('bot', 'AI Builder OS: 生成日报', () => this.run());

    // Command: manual generation
    this.addCommand({
      id: 'generate-digest',
      name: '生成今日 AI Builder OS 日报',
      callback: () => this.run(),
    });

    // Command: show settings
    this.addCommand({
      id: 'open-settings',
      name: '打开 AI Builder OS 设置',
      callback: () => {
        // @ts-ignore — openSettingTab is available
        this.app.setting.open();
        // @ts-ignore
        this.app.setting.openTabById('aba');
      },
    });

    // Schedule daily run
    this.scheduleNextRun();
  }

  onunload() {
    if (this.scheduleTimer !== null) {
      window.clearInterval(this.scheduleTimer);
    }
  }

  // -- Settings persistence --------------------------------------------------

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  // -- Main run --------------------------------------------------------------

  async run() {
    const notice = new Notice('AI Builder OS: 正在获取数据...', 0);

    try {
      // Validate settings
      if (!this.settings.apiKey) {
        notice.hide();
        new Notice('❌ AI Builder OS: 请先在设置中填写 API Key', 5000);
        return;
      }

      const result = await runGeneration(this.settings);

      // Write files to vault
      for (const file of result.files) {
        await this.ensureFolder(file.path);
        const exists = this.app.vault.getAbstractFileByPath(file.path);
        if (exists) {
          await this.app.vault.modify(exists as any, file.content);
        } else {
          await this.app.vault.create(file.path, file.content);
        }
      }

      // Update last run date
      this.settings.lastRunDate = result.date;
      await this.saveSettings();

      notice.hide();
      new Notice(
        `✅ AI Builder OS: ${result.date} 日报已生成 — ${result.opinionCount} 个观点 · ${result.files.length} 个文件`,
        8000,
      );
    } catch (err) {
      notice.hide();
      new Notice(`❌ AI Builder OS: ${(err as Error).message}`, 8000);
      console.error('[aba]', err);
    }
  }

  // -- Scheduling ------------------------------------------------------------

  scheduleNextRun() {
    // Check every 5 minutes if it's time to run
    this.scheduleTimer = window.setInterval(() => {
      if (this.shouldRunNow()) {
        this.run();
      }
    }, 5 * 60 * 1000);

    // Also register with Obsidian for cleanup
    this.registerInterval(this.scheduleTimer);
  }

  shouldRunNow(): boolean {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Already ran today
    if (this.settings.lastRunDate === today) return false;

    // Check if current time matches scheduled time (within 5 min window)
    const [h, m] = this.settings.scheduleTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const scheduleMinutes = h * 60 + m;

    return Math.abs(currentMinutes - scheduleMinutes) <= 5;
  }

  // -- Vault helpers ---------------------------------------------------------

  async ensureFolder(filePath: string) {
    const parts = filePath.split('/');
    parts.pop(); // remove filename
    let current = '';
    for (const part of parts) {
      current += (current ? '/' : '') + part;
      const exists = this.app.vault.getAbstractFileByPath(current);
      if (!exists) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}
