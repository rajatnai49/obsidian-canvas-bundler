import { App, Modal } from 'obsidian';

export class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void | Promise<void>;
	private resolved = false;

	constructor(app: App, message: string, onConfirm:() => void | Promise<void>) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("p", { text: this.message });

		const buttonRow = contentEl.createDiv({ cls: "modal-button-container" });

		const confirmBtn = buttonRow.createEl("button", {
			text: "Overwrite",
			cls: "mod-warning"
		});
		confirmBtn.addEventListener("click", () => {
			this.resolved = true;
			this.close();
			void this.onConfirm();
		});

		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
