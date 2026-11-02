import assert from "node:assert/strict";
import test from "node:test";
import registerExtension from "../extensions/tldraw-create-diagram.js";

// @lat: [[tests#Pi extension#Registers the diagram tool]]
test("registers the model-callable tool and returns its structured board URL", async () => {
	const definitions = new Map<string, any>();
	registerExtension({ registerTool: (tool: any) => definitions.set(tool.name, tool) } as any);
	const definition = definitions.get("tldraw_create_diagram");
	const updateDefinition = definitions.get("tldraw_update_diagram");
	assert.equal(definition.name, "tldraw_create_diagram");
	assert.equal(definition.annotations.openWorldHint, true);
	assert.equal(updateDefinition.annotations.destructiveHint, true);

	const previousKey = process.env.TLDRAW_PI_API_KEY;
	const previousUrl = process.env.TLDRAW_PI_API_URL;
	const previousConfig = process.env.TLDRAW_PI_CONFIG;
	const previousFetch = globalThis.fetch;
	const previousPreview = process.env.TLDRAW_PI_PREVIEW;
	const apiKey = "extension-test-token-with-at-least-32-bytes";
	const board = {
		boardId: "pi-extension-test",
		url: "http://10.0.5.40:3014/pi-extension-test",
		snapshotVersion: 1,
		tldrawSdkVersion: "4.0.2",
	};
	process.env.TLDRAW_PI_API_KEY = apiKey;
	process.env.TLDRAW_PI_API_URL = "http://10.0.5.40:3014";
	process.env.TLDRAW_PI_CONFIG = "/not/read/tldraw.json";
	process.env.TLDRAW_PI_PREVIEW = "0";
	globalThis.fetch = async (_input, init) =>
		new Response(JSON.stringify(board), { status: init?.method === "PUT" ? 200 : 201 });
	try {
		const result = await definition.execute(
			"test-call",
			{ title: "Extension test", nodes: [{ id: "pi", label: "Pi" }] },
			undefined,
			undefined,
			{},
		);
		assert.deepEqual(result.structuredContent, board);
		assert.match(result.content[0].text, /http:\/\/10\.0\.5\.40:3014\/pi-extension-test/);
		const updated = await updateDefinition.execute(
			"test-update",
			{ boardId: board.boardId, title: "Extension test", nodes: [{ id: "pi", label: "Pi updated" }] },
			undefined,
			undefined,
			{},
		);
		assert.deepEqual(updated.structuredContent, board);
		assert.match(updated.content[0].text, /Updated editable tldraw board/);
		assert.equal(JSON.stringify(result).includes(apiKey), false);
	} finally {
		if (previousKey === undefined) delete process.env.TLDRAW_PI_API_KEY;
		else process.env.TLDRAW_PI_API_KEY = previousKey;
		if (previousUrl === undefined) delete process.env.TLDRAW_PI_API_URL;
		else process.env.TLDRAW_PI_API_URL = previousUrl;
		if (previousConfig === undefined) delete process.env.TLDRAW_PI_CONFIG;
		else process.env.TLDRAW_PI_CONFIG = previousConfig;
		if (previousPreview === undefined) delete process.env.TLDRAW_PI_PREVIEW;
		else process.env.TLDRAW_PI_PREVIEW = previousPreview;
		globalThis.fetch = previousFetch;
	}
});
