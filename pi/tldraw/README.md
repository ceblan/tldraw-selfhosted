# Pi tldraw integration

A local Pi package containing the `tldraw_create_diagram` and `tldraw_update_diagram` tools plus the `tldraw-diagrams` skill. It targets the authenticated development API in this repository, not a tldraw.com personal account.

## Configure the client

Create `~/.config/pi/tldraw.json`:

```json
{
  "baseUrl": "https://tldraw.iterando.net",
  "apiKeyFile": "tldraw-dev.key",
  "timeoutMs": 15000,
  "preview": true,
  "chromiumPath": "chromium"
}
```

Store the raw bearer token in `~/.config/pi/tldraw-dev.key` with mode `600`. A relative `apiKeyFile` resolves from the configuration file's directory. The key is read only when the tool executes and is never included in tool results.

Environment overrides are `TLDRAW_PI_CONFIG`, `TLDRAW_PI_API_URL`, `TLDRAW_PI_API_KEY`, `TLDRAW_PI_API_KEY_FILE`, `TLDRAW_PI_TIMEOUT_MS`, `TLDRAW_PI_PREVIEW`, and `TLDRAW_PI_CHROMIUM`. With no configuration, the URL defaults to `http://127.0.0.1:3012`; an API key is always required. Preview defaults to enabled and requires Chromium on the Pi host. Set `TLDRAW_PI_PREVIEW=0` only to disable it explicitly; the tool will then not claim visual review.

## Load in Pi

Install this package from its absolute local path:

```sh
pi install /home/carlos/Projects/tldraw-docker/pi/tldraw
```

Then start a new Pi session or run `/reload`. Ask for an editable tldraw diagram, or force the skill with `/skill:tldraw-diagrams`.

The create tool persists one board and exports its actual contents to PNG through tldraw's browser-only `editor.toImage()` API. A small CDP client drives local headless Chromium; no browser process starts while the extension loads. The image is attached to the tool result so the model can inspect text fit, spacing, and connector routing before delivery. Use the update tool with the returned `boardId` for in-place visual revisions without changing the URL or creating duplicates. Updating destructively replaces generated pages, shapes, and bindings rather than merging manual edits.

Neither operation retries automatically. No sockets, timers, or processes are started while the extension loads. Preview failure never hides an already-created board URL and never triggers another create request.

## Tests

From the repository root, run `./pi/tldraw/test/run.sh`. It typechecks the package and runs all Node tests using the repository's TypeScript tools and the currently installed Pi host packages. The API, update, and configuration tests do not need a running service; the extension registration test uses mocked HTTP responses and disables browser preview. Real PNG export additionally requires Chromium and a running board service.

The package declares all Pi host libraries as peer dependencies; do not bundle them as runtime dependencies.
