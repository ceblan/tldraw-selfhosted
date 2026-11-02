import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

type PreviewBrowser = ChildProcessByStdio<null, null, Readable>;

export interface BoardPreview {
	data: string;
	width: number;
	height: number;
}

export interface PreviewOptions {
	chromiumPath: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

interface CdpMessage {
	id?: number;
	result?: Record<string, unknown>;
	error?: { message?: string };
}

class CdpConnection {
	private nextId = 0;
	private readonly pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

	constructor(private readonly socket: WebSocket) {
		socket.onmessage = (event) => {
			const message = JSON.parse(String(event.data)) as CdpMessage;
			if (!message.id) return;
			const request = this.pending.get(message.id);
			if (!request) return;
			this.pending.delete(message.id);
			if (message.error) request.reject(new Error(message.error.message ?? "Chromium DevTools request failed"));
			else request.resolve(message.result);
		};
	}

	call(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
		});
	}
}

async function openSocket(url: string): Promise<WebSocket> {
	const socket = new WebSocket(url);
	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () => reject(new Error("Could not connect to Chromium DevTools"));
	});
	return socket;
}

function browserWebSocket(browser: PreviewBrowser): Promise<string> {
	let stderr = "";
	return new Promise((resolve, reject) => {
		browser.stderr.on("data", (chunk) => {
			stderr += String(chunk);
			const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
			if (match) resolve(match[1]);
		});
		browser.once("error", () => reject(new Error("Chromium could not be started")));
		browser.once("exit", () => reject(new Error("Chromium stopped before the preview was ready")));
	});
}

const exportExpression = `(async () => {
	const deadline = Date.now() + 15000;
	while (Date.now() < deadline) {
		const editor = window.editor;
		if (editor && editor.getCurrentPageShapes().length > 0) {
			await new Promise(resolve => setTimeout(resolve, 500));
			const ids = [...editor.getCurrentPageShapeIds()];
			const bounds = editor.getCurrentPageBounds();
			const area = Math.max(1, bounds.w * bounds.h);
			const pixelRatio = Math.max(0.75, Math.min(1.5, 6000 / bounds.w, 6000 / bounds.h, Math.sqrt(12000000 / area)));
			const { blob, width, height } = await editor.toImage(ids, {
				format: 'png', pixelRatio, background: true, padding: 56,
			});
			if (blob.size > 16000000) throw new Error('The diagram preview exceeds 16 MB');
			const dataUrl = await new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result);
				reader.onerror = () => reject(new Error('Could not read the exported PNG'));
				reader.readAsDataURL(blob);
			});
			return { dataUrl, width: Math.round(width * pixelRatio), height: Math.round(height * pixelRatio) };
		}
		await new Promise(resolve => setTimeout(resolve, 200));
	}
	throw new Error('Timed out waiting for the board to synchronize');
})()`;

async function evaluateExport(cdp: CdpConnection, sessionId: string): Promise<BoardPreview> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await cdp.call(
				"Runtime.evaluate",
				{ expression: exportExpression, awaitPromise: true, returnByValue: true },
				sessionId,
			);
			if (response.exceptionDetails) throw new Error("The board export failed in Chromium");
			const value = response.result?.value;
			if (!value || typeof value.dataUrl !== "string") throw new Error("Chromium returned an invalid preview");
			const prefix = "data:image/png;base64,";
			if (!value.dataUrl.startsWith(prefix)) throw new Error("Chromium returned a non-PNG preview");
			return { data: value.dataUrl.slice(prefix.length), width: value.width, height: value.height };
		} catch (error) {
			lastError = error instanceof Error ? error : new Error("The board export failed");
			if (!lastError.message.includes("Execution context was destroyed")) throw lastError;
			await new Promise((resolve) => setTimeout(resolve, 600));
		}
	}
	throw lastError ?? new Error("The board export failed");
}

async function stopBrowser(browser: PreviewBrowser): Promise<void> {
	if (browser.exitCode !== null || browser.signalCode !== null) return;
	browser.kill("SIGTERM");
	await Promise.race([
		new Promise((resolve) => browser.once("exit", resolve)),
		new Promise((resolve) => setTimeout(resolve, 2_000)),
	]);
	if (browser.exitCode === null && browser.signalCode === null) browser.kill("SIGKILL");
}

/** Export the real editor contents through tldraw's browser-only image API. */
// @lat: [[architecture#Visual preview]]
export async function renderBoardPreview(url: string, options: PreviewOptions): Promise<BoardPreview> {
	if (options.signal?.aborted) throw new Error("The visual preview was cancelled");
	const profile = await mkdtemp(join(tmpdir(), "pi-tldraw-preview-"));
	const browser = spawn(
		options.chromiumPath,
		[
			"--headless",
			"--no-sandbox",
			"--disable-gpu",
			"--disable-dev-shm-usage",
			"--disable-background-networking",
			"--remote-debugging-port=0",
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdio: ["ignore", "ignore", "pipe"] },
	);
	let socket: WebSocket | undefined;
	const timeoutMs = options.timeoutMs ?? 30_000;
	let timer: NodeJS.Timeout | undefined;
	let onAbort: (() => void) | undefined;
	const abort = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error("The visual preview timed out")), timeoutMs);
		onAbort = () => reject(new Error("The visual preview was cancelled"));
		options.signal?.addEventListener("abort", onAbort, { once: true });
	});
	try {
		return await Promise.race([
			(async () => {
				const socketUrl = await browserWebSocket(browser);
				socket = await openSocket(socketUrl);
				const cdp = new CdpConnection(socket);
				const { targetId } = await cdp.call("Target.createTarget", { url });
				const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
				await new Promise((resolve) => setTimeout(resolve, 1_500));
				return await evaluateExport(cdp, sessionId);
			})(),
			abort,
		]);
	} finally {
		if (timer) clearTimeout(timer);
		if (onAbort) options.signal?.removeEventListener("abort", onAbort);
		socket?.close();
		await stopBrowser(browser);
		await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	}
}
