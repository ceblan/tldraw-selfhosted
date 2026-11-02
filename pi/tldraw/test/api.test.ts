import assert from "node:assert/strict";
import test from "node:test";
import { createBoard } from "../src/api.js";

const apiKey = "development-client-token-with-at-least-32-bytes";
const input = {
	title: "Test flow",
	nodes: [
		{ id: "a", label: "A", color: "blue" as const },
		{ id: "b", label: "B" },
	],
	edges: [{ from: "a", to: "b" }],
};
const board = {
	boardId: "pi-test-board",
	url: "http://10.0.5.40:3014/pi-test-board",
	snapshotVersion: 1,
	tldrawSdkVersion: "4.0.2",
};

// @lat: [[tests#Pi client API#Creates a board safely]]
test("creates one typed board and keeps credentials out of its result", async () => {
	let requestBody = "";
	const result = await createBoard(input, {
		baseUrl: "http://10.0.5.40:3014/",
		apiKey,
		fetchImpl: async (url, init) => {
			assert.equal(url, "http://10.0.5.40:3014/api/pi/v1/boards");
			assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${apiKey}`);
			requestBody = String(init?.body);
			return new Response(JSON.stringify(board), { status: 201 });
		},
	});
	assert.deepEqual(result, board);
	assert.equal(JSON.parse(requestBody).kind, "flowchart-v1");
	assert.equal(JSON.stringify(result).includes(apiKey), false);
});

// @lat: [[tests#Pi client API#Sanitizes HTTP errors]]
test("returns a sanitized API error without the bearer token", async () => {
	await assert.rejects(
		createBoard(input, {
			baseUrl: "http://10.0.5.40:3014",
			apiKey,
			fetchImpl: async () =>
				new Response(JSON.stringify({ error: { code: "unauthorized", message: "A valid bearer token is required" } }), {
					status: 401,
				}),
		}),
		(error: unknown) => {
			assert.match(String(error), /valid bearer token/);
			assert.equal(String(error).includes(apiKey), false);
			return true;
		},
	);
});

// @lat: [[tests#Pi client API#Rejects malformed results]]
test("rejects malformed success responses", async () => {
	await assert.rejects(
		createBoard(input, {
			baseUrl: "http://10.0.5.40:3014",
			apiKey,
			fetchImpl: async () => new Response(JSON.stringify({ boardId: "wrong" }), { status: 201 }),
		}),
		/invalid board result/,
	);
});

// @lat: [[tests#Pi client API#Honors cancellation]]
test("propagates cancellation without retrying", async () => {
	const controller = new AbortController();
	let calls = 0;
	const pending = createBoard(input, {
		baseUrl: "http://10.0.5.40:3014",
		apiKey,
		signal: controller.signal,
		fetchImpl: async (_url, init) => {
			calls++;
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
			});
		},
	});
	controller.abort();
	await assert.rejects(pending, /cancelled/);
	assert.equal(calls, 1);
});
