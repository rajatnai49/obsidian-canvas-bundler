import JSZip from 'jszip';
import { App, TFile } from 'obsidian';
import type { CanvasData, CanvasFileData, CanvasGroupData } from 'obsidian/canvas'

export default async function export_canvas(canvasRaw: string, app: App, canvasName: string) {
	const visitedNotes = new Set<string>();
	const visitedAttachments = new Set<string>();

	const canvasObjectData = JSON.parse(canvasRaw) as CanvasData
	const nodes = canvasObjectData.nodes

	let canvasFileNodes: CanvasFileData[] = [];
	let canvasAttachmentNodes: CanvasFileData[] = [];
	let canvasGroupNodes: CanvasGroupData[] = [];

	nodes.forEach((node) => {
		if (node.type == "file" && is_md_file(node.file)) {
			canvasFileNodes.push(node)
		} else if (node.type == "file") {
			canvasAttachmentNodes.push(node)
		} else if (node.type == "group") {
			canvasGroupNodes.push(node)
		}
	})

	const zip = new JSZip()

	const notesFolder = zip.folder("notes")
	const attachmentFolder = zip.folder("attachments")

	for (let attachmentNode of canvasAttachmentNodes) {
		if (visitedAttachments.has(attachmentNode.file)) {
			continue;
		}
		visitedAttachments.add(attachmentNode.file)
		let attachmentFile = app.vault.getFileByPath(attachmentNode.file)
		if (attachmentFile instanceof TFile) {
			let buffer = await app.vault.readBinary(attachmentFile)
			attachmentFolder?.file(attachmentFile.name, buffer)
			attachmentNode.file = `${canvasName}/attachments/${attachmentFile.name}`
		}
	}

	let filesToProcess: TFile[] = []

	for (let fileNode of canvasFileNodes) {
		let file = app.vault.getFileByPath(fileNode.file)
		if (file instanceof TFile) {
			fileNode.file = `${canvasName}/notes/${file.name}`
			filesToProcess.push(file)
		}
	}

	while (filesToProcess.length > 0) {
		let current = filesToProcess.pop()!

		if (visitedNotes.has(current.path)) {
			continue
		}

		visitedNotes.add(current.path)

		let data = await app.vault.read(current)

		const cache = app.metadataCache.getFileCache(current)
		const links = cache?.links ?? []
		const embededs = cache?.embeds ?? []

		for (const link of links) {
			const linkedFile = app.metadataCache.getFirstLinkpathDest(link.link, current.path)
			if (linkedFile instanceof TFile) {
				filesToProcess.push(linkedFile)
				data = data.replace(link.link, linkedFile.name)
			}
		}

		for (const embed of embededs) {
			if (visitedAttachments.has(embed.link)) {
				continue;
			}
			visitedAttachments.add(embed.link)
			const file = app.metadataCache.getFirstLinkpathDest(embed.link, current.path)
			if (file instanceof TFile) {
				let buffer = await app.vault.readBinary(file)
				attachmentFolder?.file(file.name, buffer)
				data = data.replace(embed.link, file.name)
			}
		}
		notesFolder?.file(current.name, data)
	}

	zip.file(canvasName + ".canvas", JSON.stringify(canvasObjectData))

	let zipBuffer = await zip.generateAsync({ type: "arraybuffer" })
	await app.vault.createBinary(canvasName + "Copy", zipBuffer)
}

function is_md_file(filename: string): boolean {
	const ext = filename.slice(filename.lastIndexOf('.') + 1)
	if (ext == "md") {
		return true
	}
	return false
}
