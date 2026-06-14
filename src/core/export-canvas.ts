import JSZip from 'jszip';
import { App, TFile } from 'obsidian';
import type { CanvasData, CanvasFileData, CanvasGroupData } from 'obsidian/canvas'

interface FileToProcess {
	file: TFile
	newFileName: string
}

const ATTACHMENT_FOLDER = "attachments"
const NOTES_FOLDER = "notes"

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
	const notesFolder = zip.folder(NOTES_FOLDER)!
	const attachmentFolder = zip.folder(ATTACHMENT_FOLDER)!

	// Handles Canvas Attachment Nodes
	for (let attachmentNode of canvasAttachmentNodes) {
		const file = app.vault.getFileByPath(attachmentNode.file)
		if (!(file instanceof TFile)) {
			// TODO: Handle error
			continue
		}
		const uniqueName = await addAttachment(file)

		attachmentNode.file = createCanvasPaths(canvasName, uniqueName, true)
	}

	// Handles background images of the Group Nodes
	for (let groupNode of canvasGroupNodes) {
		let bgImage = groupNode.background
		if (!bgImage) continue;

		const file = app.vault.getFileByPath(bgImage)
		if (!(file instanceof TFile)) {
			// TODO: Handle error
			continue
		}

		const uniqueName = await addAttachment(file)

		groupNode.background = createCanvasPaths(canvasName, uniqueName, true)
	}

	// Handles File Nodes
	let filesToProcess: FileToProcess[] = []

	// Files directly inside of the Canvas
	for (let fileNode of canvasFileNodes) {
		let file = app.vault.getFileByPath(fileNode.file)
		if (!(file instanceof TFile)) continue

		let uniqueName = filePathNameMapping.get(file.path)
		if (!uniqueName) {
			uniqueName = getUniqueName(file.name)
			filePathNameMapping.set(file.path, uniqueName)
			filesToProcess.push({
				file: file,
				newFileName: uniqueName
			})
		}

		fileNode.file = createCanvasPaths(canvasName, uniqueName, false)
	}

	while (filesToProcess.length > 0) {
		const { file: current, newFileName } = filesToProcess.pop()!

		if (visitedNotes.has(current.path)) continue
		visitedNotes.add(current.path)

		let data = await app.vault.read(current)

		const cache = app.metadataCache.getFileCache(current)
		const links = cache?.links ?? []
		const embeds = cache?.embeds ?? []

		const replacements: { start: number, end: number, text: string }[] = []

		for (const link of links) {
			const linkedFile = app.metadataCache.getFirstLinkpathDest(link.link, current.path)
			if (!(linkedFile instanceof TFile)) continue;

			let uniqueName = filePathNameMapping.get(linkedFile.path)
			if (!uniqueName) {
				uniqueName = getUniqueName(linkedFile.name)
				filePathNameMapping.set(linkedFile.path, uniqueName)
				filesToProcess.push({
					file: linkedFile,
					newFileName: uniqueName
				})
			}

			replacements.push({
				start: link.position.start.offset,
				end: link.position.end.offset,
				text: rewriteLink(link.original, uniqueName, false)
			})
		}

		for (const embed of embeds) {
			const file = app.metadataCache.getFirstLinkpathDest(embed.link, current.path)
			if (!(file instanceof TFile)) continue;

			let relativePath: string

			if (isMarkdownFile(file.name)) {
				let uniqueName = filePathNameMapping.get(file.path)
				if (!uniqueName) {
					uniqueName = getUniqueName(file.name)
					filePathNameMapping.set(file.path, uniqueName)
					filesToProcess.push({
						file,
						newFileName: uniqueName
					})
				}
				relativePath = uniqueName
			} else {
				const uniqueName = await addAttachment(file)
				relativePath = `../${ATTACHMENT_FOLDER}/${uniqueName}`
			}

			replacements.push({
				start: embed.position.start.offset,
				end: embed.position.end.offset,
				text: rewriteLink(embed.original, relativePath, true)
			})
		}

		// Replacement from back to front to keep offset safe
		replacements.sort((a, b) => b.start - a.start)
		for (const replacement of replacements) {
			data =
				data.slice(0, replacement.start) +
				replacement.text +
				data.slice(replacement.end)
		}

		notesFolder?.file(newFileName, data)
	}

	zip.file(`${canvasName}.canvas`, JSON.stringify(canvasObjectData))

	try {
		let zipBuffer = await zip.generateAsync({ type: "arraybuffer" })
		await app.vault.createBinary(canvasName + ".zip", zipBuffer)
	}
	catch (err) {
		console.error("Canvas Export error to write zip: ", err)
		throw err
	}


	async function addAttachment(file: TFile): Promise<string> {
		const existing = filePathNameMapping.get(file.path)
		if (existing) return existing;

		const uniqueName = getUniqueName(file.name)
		const buffer = await app.vault.readBinary(file)
		attachmentFolder.file(uniqueName, buffer)
		filePathNameMapping.set(file.path, uniqueName)

		return uniqueName
	}

	function getUniqueName(fileName: string): string {
		const currentValue = nameCounter.get(fileName);

		if (currentValue === undefined) {
			nameCounter.set(fileName, 2);
			return fileName;
		}

		nameCounter.set(fileName, currentValue + 1);

		const dotIndex = fileName.indexOf(".");

		if (dotIndex === -1) {
			return `${fileName}-${currentValue}`;
		}

		return `${fileName.slice(0, dotIndex)}-${currentValue}${fileName.slice(dotIndex)}`;
	}
}

function isMarkdownFile(filename: string): boolean {
	return filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() === "md"
}

function createCanvasPaths(canvasName: string, fileName: string, isAttachment: boolean): string {
	const folder = isAttachment ? ATTACHMENT_FOLDER : NOTES_FOLDER
	return `${canvasName}/${folder}/${fileName}`
}

function rewriteLink(original: string, newPath: string, isEmbed: boolean): string {
	const isWikiEmbed = original.startsWith("![[")
	const isWiki = original.startsWith("[[") || isWikiEmbed

	if (isWiki) {
		const open = isWikiEmbed ? "![[" : "[["
		const inner = original.slice(open.length, -2)
		const pipeIndex = inner.indexOf("|")
		const alias = pipeIndex !== -1 ? inner.slice(pipeIndex) : ""
		return `${open}${newPath}${alias}]]`
	}

	const mdMatch = original.match(/^(!?\[[^\]]*\]\()(.+?)(\))$/)
	if (mdMatch) {
		const [, prefix, , suffix] = mdMatch
		return `${prefix}${encodeURI(newPath)}${suffix}`
	}

	return original
}

