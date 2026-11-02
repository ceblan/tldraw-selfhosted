import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBoard } from "../src/api.js";
import { resolveConfig } from "../src/config.js";
import { boardResultSchema, diagramParameters, type BoardResult } from "../src/contract.js";

const createDiagramTool = defineTool({
	name: "tldraw_create_diagram",
	label: "Create tldraw diagram",
	description:
		"Create an editable tldraw flowchart from semantic nodes and edges, and return its board URL. Use only when the operator explicitly asks for a visual diagram or editable whiteboard.",
	promptSnippet: "Create an editable tldraw flowchart and return its URL",
	promptGuidelines: [
		"Use this tool only when the operator requests a visual representation, not for ordinary text answers or Mermaid source.",
		"Give nodes stable unique ids, concise labels, and edges that represent relationships supported by the answer.",
		"Call once per requested board and return the resulting URL as a clickable link. Never expose service credentials.",
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
		return {
			content: [{ type: "text", text: `Created editable tldraw board “${params.title}”:\n${board.url}` }],
			details: board,
			structuredContent: board satisfies BoardResult,
		};
	},
});

// @lat: [[architecture#Pi client package]]
export default function tldrawExtension(pi: ExtensionAPI) {
	pi.registerTool(createDiagramTool);
}
