import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBoard, updateBoard } from "../src/api.js";
import { resolveConfig, type TldrawClientConfig } from "../src/config.js";
import {
	boardResultSchema,
	diagramParameters,
	updateDiagramParameters,
	type BoardResult,
} from "../src/contract.js";
import { renderBoardPreview, type BoardPreview } from "../src/preview.js";

const previewGuidelines = [
	"Give nodes stable unique ids, concise labels, and edges that represent relationships supported by the answer.",
	"Inspect the attached PNG for text fit, legibility, spacing, and arrows crossing shapes or labels before returning the URL as a clickable link. Never expose service credentials.",
];

async function withVisualPreview(
	board: BoardResult,
	title: string,
	action: "Created" | "Updated",
	config: TldrawClientConfig,
	signal: AbortSignal | undefined,
) {
	let preview: BoardPreview | undefined;
	let message = `${action} editable tldraw board “${title}”:\n${board.url}`;
	if (config.preview) {
		try {
			preview = await renderBoardPreview(board.url, {
				chromiumPath: config.chromiumPath,
				timeoutMs: Math.max(30_000, config.timeoutMs ?? 0),
				signal,
			});
			message += `\nA ${preview.width}×${preview.height} PNG export is attached. Inspect it visually before sharing the board.`;
		} catch (error) {
			const reason = (error instanceof Error ? error.message : "unknown error")
				.replaceAll(config.apiKey, "[redacted]")
				.slice(0, 200);
			message += `\nThe board was saved, but its visual preview failed: ${reason}. Do not retry blindly or claim visual review.`;
		}
	}
	return {
		content: [
			{ type: "text" as const, text: message },
			...(preview ? [{ type: "image" as const, data: preview.data, mimeType: "image/png" }] : []),
		],
		details: board,
		structuredContent: board satisfies BoardResult,
	};
}

const createDiagramTool = defineTool({
	name: "tldraw_create_diagram",
	label: "Create tldraw diagram",
	description:
		"Create an editable tldraw flowchart from semantic nodes and edges, and return its board URL with a real PNG preview for visual inspection. Use only when the operator explicitly asks for a visual diagram or editable whiteboard.",
	promptSnippet: "Create an editable tldraw flowchart and return its URL with a visual preview",
	promptGuidelines: [
		"Use this tool only when the operator requests a visual representation, not for ordinary text answers or Mermaid source.",
		"Call once for a new board. If visual inspection reveals problems, use tldraw_update_diagram with the returned boardId instead of creating a duplicate.",
		...previewGuidelines,
	],
	parameters: diagramParameters,
	outputSchema: boardResultSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: false,
		idempotentHint: false,
		openWorldHint: true,
	},
	async execute(_toolCallId, params, signal) {
		const config = await resolveConfig();
		const board = await createBoard(params, { ...config, signal });
		return withVisualPreview(board, params.title, "Created", config, signal);
	},
});

const updateDiagramTool = defineTool({
	name: "tldraw_update_diagram",
	label: "Update tldraw diagram",
	description:
		"Replace an existing generated tldraw flowchart in place after visual review, preserving its board URL and returning a new PNG preview. This replaces the board's pages, shapes, and bindings.",
	promptSnippet: "Revise a generated tldraw flowchart and inspect its updated visual preview",
	promptGuidelines: [
		"Use the boardId returned by tldraw_create_diagram; never invent an id or update a board the operator did not authorize.",
		"This is a destructive in-place replacement, not a merge with manual edits. Use it to complete the create → inspect → revise → inspect workflow without duplicate boards.",
		...previewGuidelines,
	],
	parameters: updateDiagramParameters,
	outputSchema: boardResultSchema,
	annotations: {
		readOnlyHint: false,
		destructiveHint: true,
		idempotentHint: true,
		openWorldHint: true,
	},
	async execute(_toolCallId, params, signal) {
		const config = await resolveConfig();
		const board = await updateBoard(params, { ...config, signal });
		return withVisualPreview(board, params.title, "Updated", config, signal);
	},
});

// @lat: [[architecture#Pi client package]]
export default function tldrawExtension(pi: ExtensionAPI) {
	pi.registerTool(createDiagramTool);
	pi.registerTool(updateDiagramTool);
}
