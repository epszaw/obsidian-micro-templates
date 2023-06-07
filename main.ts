import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  FuzzySuggestModal,
} from "obsidian";
import { join } from "path";
import { sync } from "fast-glob";
import { readFile } from "fs/promises";
import { EOL } from "os";
import ejs from "ejs";
import dayjs from "dayjs";

interface MicroTemplatesSettings {
  templatesDir: string;
}

const DEFAULT_SETTINGS: MicroTemplatesSettings = {
  templatesDir: "",
};

type SourceDir = {
  path: string;
  name: string;
};

type Template = {
  path: string;
  name: string;
};

export class VaultDirectoriesSuggestModal extends FuzzySuggestModal<SourceDir> {
  rootPath: string;
  onSelect: (dir: string) => void;

  constructor(app: App, onSelect: (dir: string) => void) {
    super(app);

    this.onSelect = onSelect;
    // @ts-ignore
    this.rootPath = this.app.vault.adapter.basePath as string;
  }

  getItems(): SourceDir[] {
    const items = sync(join(this.rootPath, "**/*"), {
      onlyDirectories: true,
    }).map((dirPath) => ({
      path: dirPath,
      name: `<root>${dirPath.replace(this.rootPath, "")}`,
    }));

    return items;
  }

  getItemText(item: SourceDir): string {
    return item.name;
  }

  onChooseItem(item: SourceDir, evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item.path);
  }
}

export class TemplatesSuggestModal extends FuzzySuggestModal<Template> {
  templatesDir: string;
  onSelect: (content: string) => void;

  constructor(
    app: App,
    templatesDir: string,
    onSelect: (content: string) => void
  ) {
    super(app);

    this.templatesDir = templatesDir;
    this.onSelect = onSelect;
  }

  getItems(): Template[] {
    const items = sync(join(this.templatesDir, "**/*")).map((templatePath) => ({
      path: templatePath,
      name: `<root>${templatePath.replace(this.templatesDir, "")}`,
    }));

    return items;
  }

  getItemText(item: Template): string {
    return item.name;
  }

  async onChooseItem(item: Template) {
    const templateContent = await readFile(item.path, "utf-8");

    this.onSelect(
      ejs.render(templateContent, {
        d: dayjs,
      })
    );
  }
}

export default class MicroTemplates extends Plugin {
  settings: MicroTemplatesSettings;
  templatesSoureDir = "";

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "micro-templates.select-templates-source-dir",
      name: "select source folder",
      callback: async () => {
        const dirModal = new VaultDirectoriesSuggestModal(
          this.app,
          async (dir) => {
            this.settings.templatesDir = dir;
            await this.saveSettings();
          }
        );

        dirModal.open();
      },
    });
    this.addCommand({
      id: "micro-templates.insert",
      name: "insert",
      editorCallback: async (editor) => {
        const templateModal = new TemplatesSuggestModal(
          this.app,
          this.settings.templatesDir,
          (content) => {
            const currentCursorPosition = editor.getCursor();
            const contentLines = content.split(EOL);
            const cursorLineIdx = contentLines.findIndex((line) =>
              line.includes("$cur")
            );

            editor.replaceRange(content, currentCursorPosition);

            if (cursorLineIdx === -1) return;

            const cursorСh = contentLines[cursorLineIdx].indexOf("$cur");

            editor.setCursor(
              currentCursorPosition.line + cursorLineIdx,
              cursorСh
            );

            const newCursorPosition = editor.getCursor();

            editor.replaceRange("", newCursorPosition, {
              line: newCursorPosition.line,
              ch: newCursorPosition.ch + 4,
            });
          }
        );

        templateModal.open();
      },
    });

    this.addSettingTab(new MicroTemplatesSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class MicroTemplatesSettingTab extends PluginSettingTab {
  plugin: MicroTemplates;

  constructor(app: App, plugin: MicroTemplates) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Micro templates" });

    new Setting(containerEl)
      .setName("Path to templates source directory")
      .setDesc("Use `select source folder` command or set it manually")
      .addText((text) =>
        text
          .setPlaceholder("/path/to/my/files")
          .setValue(this.plugin.settings.templatesDir)
          .onChange(async (value) => {
            this.plugin.settings.templatesDir = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
