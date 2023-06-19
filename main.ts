import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  FuzzySuggestModal,
  TFile,
} from "obsidian";
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
    const files = this.app.vault
      .getFiles()
      .map(({ parent }) => parent)
      .filter(Boolean)
      .reduce<Map<string, SourceDir>>((acc, dir) => {
        const name = ["<root>", dir?.name || ""].join("/");

        return acc.set(dir?.path || "", {
          path: dir?.path || "",
          name,
        })
      }, new Map())

    return Array.from(files.values());
  }

  getItemText(item: SourceDir): string {
    return item.name;
  }

  onChooseItem(item: SourceDir, evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item.path);
  }
}

export class TemplatesSuggestModal extends FuzzySuggestModal<TFile> {
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

  getItems(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter(({ parent }) => parent?.path === this.templatesDir)
  }

  getItemText(file: TFile): string {
    return file.name;
  }

  async onChooseItem(item: TFile) {
    const templateContent = await this.app.vault.read(item);

    this.onSelect(
      ejs.render(templateContent, {
        d: dayjs,
      })
    );
  }
}

export default class MicroTemplates extends Plugin {
  settings: MicroTemplatesSettings;

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

            const cursorCh = contentLines[cursorLineIdx].indexOf("$cur");

            editor.setCursor(
              currentCursorPosition.line + cursorLineIdx,
              cursorCh
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
