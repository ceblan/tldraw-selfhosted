import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveConfig } from "../src/config.js";

// @lat: [[tests#Pi client configuration#Loads protected file configuration]]
test("loads a relative key file and explicit development URL", async () => {
	const directory = await mkdtemp(join(tmpdir(), "pi-tldraw-config-"));
	try {
		await writeFile(join(directory, "tldraw.json"), JSON.stringify({ baseUrl: "http://10.0.5.40:3014", apiKeyFile: "client.key", preview: false, chromiumPath: "/usr/bin/chromium" }));
		await writeFile(join(directory, "client.key"), "file-token-with-at-least-32-bytes\n", { mode: 0o600 });
		const config = await resolveConfig({ env: {}, configPath: join(directory, "tldraw.json") });
		assert.equal(config.baseUrl, "http://10.0.5.40:3014");
		assert.equal(config.apiKey, "file-token-with-at-least-32-bytes");
		assert.equal(config.preview, false);
		assert.equal(config.chromiumPath, "/usr/bin/chromium");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

// @lat: [[tests#Pi client configuration#Applies environment overrides]]
test("environment credentials take precedence without reading a key file", async () => {
	const config = await resolveConfig({
		env: {
			TLDRAW_PI_API_URL: "http://127.0.0.1:3012",
			TLDRAW_PI_API_KEY: "environment-token-with-at-least-32-bytes",
			TLDRAW_PI_API_KEY_FILE: "/must/not/be/read",
			TLDRAW_PI_PREVIEW: "1",
			TLDRAW_PI_CHROMIUM: "/opt/chromium",
		},
		configPath: "/also/not/read/tldraw.json",
	});
	assert.equal(config.apiKey, "environment-token-with-at-least-32-bytes");
	assert.equal(config.baseUrl, "http://127.0.0.1:3012");
	assert.equal(config.preview, true);
	assert.equal(config.chromiumPath, "/opt/chromium");
});

// @lat: [[tests#Pi client configuration#Explains missing configuration]]
test("fails with actionable configuration guidance when no key exists", async () => {
	await assert.rejects(
		resolveConfig({ env: {}, configPath: "/not/a/real/config/tldraw.json" }),
		/Configure TLDRAW_PI_API_KEY or apiKeyFile/,
	);
});
