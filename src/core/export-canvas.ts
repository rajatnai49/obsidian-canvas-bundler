import JSZip from 'jszip';
import { App, TFile } from 'obsidian';
import type { CanvasData, CanvasFileData, CanvasGroupData } from 'obsidian/canvas'

interface FileToProcess {
	file: TFile
	newFileName: string
}

export default async function export_canvas(canvasRaw: string, app: App, canvasName: string) {
	const visitedNotes = new Set<string>();

	const nameCounter = new Map<string, number>();
	const filePathNameMapping = new Map<string, string>();

	const canvasObjectData = JSON.parse(canvasRaw) as CanvasData
	const nodes = canvasObjectData.nodes

	let canvasFileNodes: CanvasFileData[] = [];
	let canvasAttachmentNodes: CanvasFileData[] = [];
	let canvasGroupNodes: CanvasGroupData[] = [];

	nodes.forEach((node) => {
		if (node.type == "file" && isMarkdownFile(node.file)) {
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

	// Handles attachments directly inside of the Canvas
	for (let attachmentNode of canvasAttachmentNodes) {
		if (filePathNameMapping.has(attachmentNode.file)) {
			attachmentNode.file = filePathNameMapping.get(attachmentNode.file) ?? ""
			continue;
		}
		let attachmentFile = app.vault.getFileByPath(attachmentNode.file)
		if (attachmentFile instanceof TFile) {
			let buffer = await app.vault.readBinary(attachmentFile)
			let newAttachmentName = getUniqueName(attachmentFile.name, nameCounter)
			attachmentFolder?.file(newAttachmentName, buffer)
			let newAttachmentFilePath = `${canvasName}/attachments/${newAttachmentName}`
			filePathNameMapping.set(attachmentNode.file, newAttachmentFilePath)
			attachmentNode.file = newAttachmentFilePath
		}
	}

	// Handles background images of the Group Nodes
	for (let groupNode of canvasGroupNodes) {
		let bgImage = groupNode.background
		if (!bgImage) {
			continue;
		}
		if (filePathNameMapping.has(bgImage)) {
			groupNode.background = filePathNameMapping.get(bgImage) ?? ""
			continue;
		}
		let bgImageFile = app.vault.getFileByPath(bgImage)
		if (bgImageFile instanceof TFile) {
			let buffer = await app.vault.readBinary(bgImageFile)
			let newBgImageName = getUniqueName(bgImageFile.name, nameCounter)
			attachmentFolder?.file(newBgImageName, buffer)
			let newBgImagePath = `${canvasName}/attachments/${newBgImageName}`
			filePathNameMapping.set(bgImage, newBgImagePath)
			groupNode.background = newBgImagePath
		}

	}

	// Handles File Nodes
	let filesToProcess: FileToProcess[] = []

	// Files directly inside of the Canvas
	for (let fileNode of canvasFileNodes) {
		let file = app.vault.getFileByPath(fileNode.file)
		if (!(file instanceof TFile)) continue

		let newFilePath = filePathNameMapping.get(file.path)

		if (!newFilePath) {
			let newFileName = getUniqueName(file.name, nameCounter)
			newFilePath = `${canvasName}/notes/${newFileName}`

			filePathNameMapping.set(file.path, newFilePath)

			filesToProcess.push({
				file: file,
				newFileName: newFileName
			})
		}
		fileNode.file = newFilePath
	}

	while (filesToProcess.length > 0) {
		let currentItem = filesToProcess.pop()!
		let current = currentItem.file

		if (visitedNotes.has(current.path)) {
			continue
		}

		visitedNotes.add(current.path)

		let data = await app.vault.read(current)

		const cache = app.metadataCache.getFileCache(current)
		const links = cache?.links ?? []
		const embededs = cache?.embeds ?? []
		const replacements = []

		for (const link of links) {
			const linkedFile = app.metadataCache.getFirstLinkpathDest(link.link, current.path)
			if (!(linkedFile instanceof TFile)) continue;

			let newFilePath = filePathNameMapping.get(linkedFile.path)

			if (!newFilePath) {
				let linkedFileNewName = getUniqueName(linkedFile.name, nameCounter)
				newFilePath = `${canvasName}/notes/${linkedFileNewName}`

				filePathNameMapping.set(linkedFile.path, newFilePath)

				filesToProcess.push({
					file: linkedFile,
					newFileName: linkedFileNewName
				})
			}

			replacements.push({
				start: link.position.start.offset,
				end: link.position.end.offset,
				text: rewriteOriginalLink(link.original, newFilePath, false)
			})
		}

		for (const embed of embededs) {
			const file = app.metadataCache.getFirstLinkpathDest(embed.link, current.path)
			if (!(file instanceof TFile)) continue;

			let embededNewFilePath = filePathNameMapping.get(file.path)

			if (!embededNewFilePath) {
				let buffer = await app.vault.readBinary(file)
				let embededNewName = getUniqueName(file.name, nameCounter)
				attachmentFolder?.file(embededNewName, buffer)
				embededNewFilePath = `${canvasName}/attachments/${embededNewName}`
				filePathNameMapping.set(file.path, embededNewFilePath)
			}

			replacements.push({
				start: embed.position.start.offset,
				end: embed.position.end.offset,
				text: rewriteOriginalLink(embed.original, embededNewFilePath, true)
			})
		}

		replacements.sort((a, b) => b.start - a.start)

		for (const replacement of replacements) {
			data =
				data.slice(0, replacement.start) +
				replacement.text +
				data.slice(replacement.end)
		}

		let fileName = currentItem.newFileName
		notesFolder?.file(fileName, data)
	}

	zip.file(canvasName + ".canvas", JSON.stringify(canvasObjectData))

	let zipBuffer = await zip.generateAsync({ type: "arraybuffer" })
	await app.vault.createBinary(canvasName + ".zip", zipBuffer)
}

function isMarkdownFile(filename: string): boolean {
	const ext = filename.slice(filename.lastIndexOf('.') + 1)
	if (ext == "md") {
		return true
	}
	return false
}

function getUniqueName(
	fileName: string,
	currentCounterMap: Map<string, number>
): string {
	const currentValue = currentCounterMap.get(fileName);

	if (currentValue === undefined) {
		currentCounterMap.set(fileName, 2);
		return fileName;
	}

	currentCounterMap.set(fileName, currentValue + 1);

	const match = fileName.match(/^(.+?)(\.[^.]+(?:\.[^.]+)*)$/);

	if (!match) {
		return `${fileName}-${currentValue}`;
	}

	const [, name, extension] = match;

	return `${name}-${currentValue}${extension}`;
}


function rewriteOriginalLink(
	original: string,
	newPath: string,
	isAttachment: boolean
): string {
	const relativePath = isAttachment
		? newPath.replace(/^[^/]+\/attachments\//, "../attachments/")
		: newPath.replace(/^[^/]+\/notes\//, "./notes/");

	if (original.startsWith("[[") || original.startsWith("![[")) {
		const isEmbed = original.startsWith("![[");

		const open = isEmbed ? "![[" : "[[";
		const close = "]]";

		const inner = original.slice(open.length, -close.length);
		const aliasIndex = inner.indexOf("|");

		if (aliasIndex !== -1) {
			const alias = inner.slice(aliasIndex);
			return `${open}${relativePath}${alias}${close}`;
		}

		return `${open}${relativePath}${close}`;
	}

	const markdownLinkMatch = original.match(/^(!?\[[^\]]*\]\()(.+?)(\))$/);

	if (markdownLinkMatch) {
		const [, prefix, , suffix] = markdownLinkMatch;
		return `${prefix}${encodeURI(relativePath)}${suffix}`;
	}

	return original;
}
