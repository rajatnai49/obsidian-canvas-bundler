import export_canvas from 'core/export-canvas';
import { Notice, Plugin } from 'obsidian';

export default class CanvasBundlePlugin extends Plugin {

	async onload() {
		console.debug("Plugin Loaded")
		this.addCommand({
			id: "export",
			name: "Export",

			callback: async () => {
				const file = this.app.workspace.getActiveFile();

				if (!file || file.extension !== "canvas") {
					new Notice("No active canvas found!")
					return;
				}

				const content = await this.app.vault.read(file)
				await export_canvas(content, this.app, file.basename)
			}
		})
	}

	onunload() {
		console.debug("plugin unloaded")
	}

	async loadSettings() {
	}

	async saveSettings() {
	}
}
