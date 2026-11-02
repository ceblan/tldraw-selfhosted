import type { BoardResult, DiagramInput, UpdateDiagramInput } from "./contract.js";

export interface CreateBoardOptions {
	baseUrl: string;
	apiKey: string;
	timeoutMs?: number;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}

export function normalizeBaseUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("TLDRAW_PI_API_URL must be a valid HTTP(S) URL");
	}
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new Error("TLDRAW_PI_API_URL must not contain credentials, a query, or a fragment");
	}
	return url.href.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

async function responseJson(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text.length > 64 * 1024) throw new Error("tldraw API returned an oversized response");
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("tldraw API returned invalid JSON");
	}
}

function parseBoardResult(value: unknown): BoardResult {
	if (!isRecord(value)) throw new Error("tldraw API returned an invalid board result");
	const { boardId, url, snapshotVersion, tldrawSdkVersion } = value;
	if (
		typeof boardId !== "string" ||
		typeof url !== "string" ||
		typeof snapshotVersion !== "number" ||
		!Number.isFinite(snapshotVersion) ||
		typeof tldrawSdkVersion !== "string"
	) {
		throw new Error("tldraw API returned an invalid board result");
	}
	const parsedUrl = normalizeBaseUrl(url);
	if (!/^pi-[a-zA-Z0-9_-]+$/.test(boardId) || !parsedUrl.endsWith(`/${boardId}`)) {
		throw new Error("tldraw API returned an inconsistent board result");
	}
	return { boardId, url, snapshotVersion, tldrawSdkVersion };
}

async function requestBoard(
	input: DiagramInput,
	options: CreateBoardOptions,
	request: { method: "POST" | "PUT"; path: string; successStatus: 200 | 201; action: "creation" | "update" },
): Promise<BoardResult> {
	const baseUrl = normalizeBaseUrl(options.baseUrl);
	const apiKey = options.apiKey.trim();
	if (new TextEncoder().encode(apiKey).length < 32) {
		throw new Error("The tldraw API key must contain at least 32 bytes");
	}
	const timeoutMs = options.timeoutMs ?? 15_000;
	if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
		throw new Error("The tldraw API timeout must be between 100 and 120000 milliseconds");
	}
	const timeout = AbortSignal.timeout(timeoutMs);
	const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;

	try {
		const response = await fetchImpl(`${baseUrl}${request.path}`, {
			method: request.method,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ kind: "flowchart-v1", ...input, edges: input.edges ?? [] }),
			signal,
		});
		const body = await responseJson(response);
		if (response.status !== request.successStatus) {
			const message =
				isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
					? body.error.message.slice(0, 300)
					: `HTTP ${response.status}`;
			throw new Error(`tldraw board ${request.action} failed: ${message}`);
		}
		return parseBoardResult(body);
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("tldraw ")) throw error;
		if (options.signal?.aborted) throw new Error(`tldraw board ${request.action} was cancelled`);
		if (timeout.aborted) throw new Error(`tldraw board ${request.action} timed out`);
		throw new Error(`tldraw API is unreachable at ${baseUrl}`);
	}
}

/** Create exactly one board; automatic retries could create duplicate external artifacts. */
// @lat: [[architecture#Pi client package]]
export async function createBoard(input: DiagramInput, options: CreateBoardOptions): Promise<BoardResult> {
	return requestBoard(input, options, {
		method: "POST",
		path: "/api/pi/v1/boards",
		successStatus: 201,
		action: "creation",
	});
}

/** Replace one existing board after visual review, preserving its public URL. */
// @lat: [[architecture#Visual revision workflow]]
export async function updateBoard(
	input: UpdateDiagramInput,
	options: CreateBoardOptions,
): Promise<BoardResult> {
	if (!/^pi-[a-zA-Z0-9_-]+$/.test(input.boardId)) throw new Error("A valid generated boardId is required");
	const { boardId, ...diagram } = input;
	return requestBoard(diagram, options, {
		method: "PUT",
		path: `/api/pi/v1/boards/${encodeURIComponent(boardId)}`,
		successStatus: 200,
		action: "update",
	});
}
