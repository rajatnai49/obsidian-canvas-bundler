# Canvas Bundle

Canvas Bundle exports an Obsidian canvas and its connected files into a portable zip archive.

Use it when you want to share or back up a canvas without manually collecting every linked note, attachment, and canvas asset.

## Features

- Exports the active `.canvas` file.
- Includes markdown notes used in canvas file nodes.
- Follows note links and embedded markdown files so related notes are included.
- Includes non-markdown attachments used by canvas nodes, note embeds, and group background images.
- Rewrites canvas paths and note links so the exported bundle stays connected.
- Handles duplicate filenames by generating unique names inside the bundle.

## Usage

1. Open a canvas file in Obsidian.
2. Open the command palette.
3. Run **Canvas Bundle: Export**.
4. Find the generated `.zip` file in your vault root.

The zip contains:

- `<canvas-name>.canvas`
- `notes/`
- `attachments/`

## Limitations

- The plugin creates the exported zip in the vault root.
- Missing or unresolved files are skipped.
- This plugin is desktop-only.

## Planned for future releases

- Include backlinks from exported text notes.
- Recursively process canvas files embedded or linked inside exported notes.

## Development

Install dependencies:

```bash
npm install
```

Start the development build:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Run lint checks:

```bash
npm run lint
```

## Manual installation

Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<Vault>/.obsidian/plugins/canvas-bundle/
```

Then reload Obsidian and enable **Canvas Bundle** in **Settings -> Community plugins**.
