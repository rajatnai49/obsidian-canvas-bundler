import export_canvas from 'core/export-canvas';
import { Notice, Plugin } from 'obsidian';

export default class CanvasBundlePlugin extends Plugin {

	async onload() {
		this.addCommand({
			id: "export-canvas-as-zip",
			name: "Export canvas as zip",

			callback: async () => {
				const file = this.app.workspace.getActiveFile();

				if (!file || file.extension !== "canvas") {
					new Notice("No active canvas found!")
					return;
				}

				try {
					const content = await this.app.vault.read(file)
					await export_canvas(content, this.app, file.basename)
					new Notice("Canvas bundle exported.")
				} catch (error) {
					console.error("Failed to export canvas bundle:", error)
					new Notice("Failed to export canvas bundle.")
				}
			}
		})
	}
}
