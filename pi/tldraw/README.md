# Pi tldraw integration

A local Pi package containing the `tldraw_create_diagram` tool and the `tldraw-diagrams` skill. It targets the authenticated development API in this repository, not a tldraw.com personal account.

## Configure the client

Create `~/.config/pi/tldraw.json`:

```json
{
  "baseUrl": "http://10.0.5.40:3014",
  "apiKeyFile": "tldraw-dev.key",
  "timeoutMs": 15000
}
```

Store the raw bearer token in `~/.config/pi/tldraw-dev.key` with mode `600`. A relative `apiKeyFile` resolves from the configuration file's directory. The key is read only when the tool executes and is never included in tool results.

Environment overrides are `TLDRAW_PI_CONFIG`, `TLDRAW_PI_API_URL`, `TLDRAW_PI_API_KEY`, `TLDRAW_PI_API_KEY_FILE`, and `TLDRAW_PI_TIMEOUT_MS`. With no configuration, the URL defaults to `http://127.0.0.1:3012`; an API key is always required.

## Load in Pi

Install this package from its absolute local path:

```sh
pi install /home/carlos/Projects/tldraw-docker/pi/tldraw
```

Then start a new Pi session or run `/reload`. Ask for an editable tldraw diagram, or force the skill with `/skill:tldraw-diagrams`.

The tool creates an external persistent board and is not idempotent. It does not retry automatically. No sockets, timers, or processes are started while the extension loads.

## Tests

From the repository root, run `./pi/tldraw/test/run.sh`. It typechecks the package and runs all Node tests using the repository's TypeScript tools and the currently installed Pi host packages. The API and configuration tests do not need a running service; the extension registration test uses a mocked HTTP response.

The package declares all Pi host libraries as peer dependencies; do not bundle them as runtime dependencies.
