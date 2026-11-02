import assert from "node:assert/strict";
import test from "node:test";
import registerExtension from "../extensions/tldraw-create-diagram.js";

// @lat: [[tests#Pi extension#Registers the diagram tool]]
test("registers the model-callable tool and returns its structured board URL", async () => {
	let definition: any;
	registerExtension({ registerTool: (tool: any) => (definition = tool) } as any);
	assert.equal(definition.name, "tldraw_create_diagram");
	assert.equal(definition.annotations.openWorldHint, true);

	const previousKey = process.env.TLDRAW_PI_API_KEY;
	const previousUrl = process.env.TLDRAW_PI_API_URL;
	const previousConfig = process.env.TLDRAW_PI_CONFIG;
	const previousFetch = globalThis.fetch;
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
	globalThis.fetch = async () => new Response(JSON.stringify(board), { status: 201 });
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
		assert.equal(JSON.stringify(result).includes(apiKey), false);
	} finally {
		if (previousKey === undefined) delete process.env.TLDRAW_PI_API_KEY;
		else process.env.TLDRAW_PI_API_KEY = previousKey;
		if (previousUrl === undefined) delete process.env.TLDRAW_PI_API_URL;
		else process.env.TLDRAW_PI_API_URL = previousUrl;
		if (previousConfig === undefined) delete process.env.TLDRAW_PI_CONFIG;
		else process.env.TLDRAW_PI_CONFIG = previousConfig;
		globalThis.fetch = previousFetch;
	}
});
