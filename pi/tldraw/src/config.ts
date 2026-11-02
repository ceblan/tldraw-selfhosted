import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface TldrawClientConfig {
	baseUrl: string;
	apiKey: string;
	timeoutMs?: number;
	preview: boolean;
	chromiumPath: string;
}

interface ConfigFile {
	baseUrl?: string;
	apiKeyFile?: string;
	timeoutMs?: number;
	preview?: boolean;
	chromiumPath?: string;
}

export interface ResolveConfigOptions {
	env?: NodeJS.ProcessEnv;
	homeDir?: string;
	configPath?: string;
}

function expandHome(path: string, home: string): string {
	if (path === "~") return home;
	if (path.startsWith("~/")) return join(home, path.slice(2));
	return path;
}

async function readConfigFile(path: string): Promise<ConfigFile> {
	try {
		const value: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
		const config = value as Record<string, unknown>;
		for (const key of ["baseUrl", "apiKeyFile", "chromiumPath"]) {
			if (config[key] !== undefined && typeof config[key] !== "string") {
				throw new Error(`${key} must be a string`);
			}
		}
		if (config.timeoutMs !== undefined && typeof config.timeoutMs !== "number") {
			throw new Error("timeoutMs must be a number");
		}
		if (config.preview !== undefined && typeof config.preview !== "boolean") {
			throw new Error("preview must be a boolean");
		}
		return config as ConfigFile;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw new Error(`Could not read a valid tldraw client configuration at ${path}`);
	}
}

/** Resolve configuration at call time so key rotation does not require an extension reload. */
// @lat: [[architecture#Client configuration]]
export async function resolveConfig(options: ResolveConfigOptions = {}): Promise<TldrawClientConfig> {
	const env = options.env ?? process.env;
	const home = options.homeDir ?? homedir();
	const configPath = resolve(
		expandHome(options.configPath ?? env.TLDRAW_PI_CONFIG ?? join(home, ".config", "pi", "tldraw.json"), home),
	);
	const file = await readConfigFile(configPath);
	let apiKey = env.TLDRAW_PI_API_KEY?.trim();
	if (!apiKey) {
		const keyFile = env.TLDRAW_PI_API_KEY_FILE ?? file.apiKeyFile;
		if (keyFile) {
			const expanded = expandHome(keyFile, home);
			const keyPath = isAbsolute(expanded) ? expanded : resolve(dirname(configPath), expanded);
			try {
				apiKey = (await readFile(keyPath, "utf8")).trim();
			} catch {
				throw new Error(`Could not read the tldraw API key file at ${keyPath}`);
			}
		}
	}
	if (!apiKey) {
		throw new Error(
			"Configure TLDRAW_PI_API_KEY or apiKeyFile in ~/.config/pi/tldraw.json before creating a tldraw board",
		);
	}
	return {
		baseUrl: env.TLDRAW_PI_API_URL ?? file.baseUrl ?? "http://127.0.0.1:3012",
		apiKey,
		timeoutMs: env.TLDRAW_PI_TIMEOUT_MS ? Number(env.TLDRAW_PI_TIMEOUT_MS) : file.timeoutMs,
		preview: env.TLDRAW_PI_PREVIEW
			? !["0", "false", "no"].includes(env.TLDRAW_PI_PREVIEW.toLowerCase())
			: (file.preview ?? true),
		chromiumPath: env.TLDRAW_PI_CHROMIUM ?? file.chromiumPath ?? "chromium",
	};
}
