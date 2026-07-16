import { ConfirmModal } from 'core/confirm-modal';
import export_canvas from 'core/export-canvas';
import { Notice, Plugin, TFile } from 'obsidian';

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

				const parentPath = file.parent?.path ?? ""
				const zipPath = parentPath ? `${parentPath}/${file.basename}.zip` : `${file.basename}.zip`
				const existing = this.app.vault.getAbstractFileByPath(zipPath)

				const runExport = async () => {
					try {
						const content = await this.app.vault.read(file)
						await export_canvas(content, this.app, file.basename, parentPath)
						new Notice("Canvas bundle exported.")
					} catch (error) {
						console.error("Failed to export canvas bundle:", error)
						new Notice("Failed to export canvas bundle.")
					}
				}

				if (existing instanceof TFile) {
					new ConfirmModal(
						this.app,
						`"${zipPath}" already exists. Overwrite it?`,
						runExport
					).open()
				} else {
					await runExport()
				}
			}
		})
	}
}
