# Self-hosted tldraw with a Pi diagram API

Development fork of [FoxxMD/tldraw-selfhosted](https://github.com/FoxxMD/tldraw-selfhosted), based on tldraw **4.0.2**. It retains the browser editor, WebSocket collaboration, and file-backed rooms, and adds a small authenticated API that turns a semantic flowchart into a tldraw document.

**This branch is for development and isolated testing. It is not production-ready. The separate EMACS-30 development instance is available on port 3014; the original port 3012 service is unchanged.**

## Development prerequisites

- Node.js 22 and Yarn 1 (`npx yarn@1.22.22 ...` works without a global Yarn install).
- Docker with BuildKit and Compose for an isolated local runtime.
- A random Pi service token. No tldraw production license key is needed for development.

```sh
npx --yes yarn@1.22.22 install --frozen-lockfile
npx --yes yarn@1.22.22 build
npx --yes yarn@1.22.22 test
docker build -t tldraw-pi:dev .
```

An optional CI workflow is provided at `docs/ci.example.yml`. Copy it to `.github/workflows/ci.yml` to enable it in a repository whose credentials allow workflow changes.

For the local container:

```sh
cp .env.development.example .env.development
# Replace PI_API_KEY in .env.development, then:
docker compose --env-file .env.development -f compose.dev.yaml up --build
```

This binds only to `127.0.0.1:3012` and uses a separate named volume. It does not touch the existing remote container or its data.

## Create a diagram

The API is disabled unless `PI_API_ENABLED=true` and `PI_API_KEY` is configured with at least 32 bytes. It accepts the versioned `flowchart-v1` contract, not arbitrary tldraw record JSON.

```sh
curl --fail-with-body -sS http://127.0.0.1:3012/api/pi/v1/boards \
  -H "Authorization: Bearer $PI_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{
    "kind": "flowchart-v1",
    "title": "How Pi creates a diagram",
    "layout": "horizontal",
    "nodes": [
      { "id": "operator", "label": "Operator", "color": "blue" },
      { "id": "pi", "label": "Pi", "kind": "diamond" },
      { "id": "board", "label": "tldraw board", "color": "green" }
    ],
    "edges": [
      { "from": "operator", "to": "pi", "label": "request" },
      { "from": "pi", "to": "board", "label": "create" }
    ]
  }'
```

Response:

```json
{
  "boardId": "pi-…",
  "snapshotVersion": 1,
  "url": "http://localhost:3012/pi-…",
  "tldrawSdkVersion": "4.0.2"
}
```

The URL is the editable room URL. `PUBLIC_BASE_URL` controls the returned URL; it does not configure a reverse proxy or public access. Node labels are plain text, node kinds are `rectangle`, `ellipse`, or `diamond`, and layout is `horizontal` or `vertical`. The request is limited to 50 nodes, 100 edges, and 64 KiB.

## Implementation boundaries

- `diagram.ts` validates Pi's versioned input contract.
- `diagram-records.ts` performs deterministic layout and schema-validated tldraw record generation, including arrow bindings.
- `RoomStore.createBoard()` commits those records in one `TLSocketRoom.updateStore()` transaction and atomically persists the snapshot before returning.
- `pi-api.ts` adds bearer authentication, bounded JSON input, and structured errors. No service token is placed in the board URL.
- `server.node.ts` retains the original browser collaboration plane and wires the control plane into the same process.

Writes are not performed by a second process against `.rooms` files. All tldraw packages are pinned to 4.0.2, and the Docker base image is pinned by digest. The image build uses the frozen lockfile. A future license key can be passed with a BuildKit secret named `tldraw_license_key`, without storing it in a Docker layer.

## Pi skill and extension

The `pi/tldraw` package provides `tldraw_create_diagram` and the `tldraw-diagrams` skill. It reads configuration from `~/.config/pi/tldraw.json` and a separate protected key file, then returns both a clickable URL and structured board metadata. See [its README](pi/tldraw/README.md) for installation and configuration.

## EMACS-30 development service

`compose.emacs30.yaml` runs an independent instance at `http://10.0.5.40:3014`, with a named persistent volume and no changes to the original port 3012 container. Open **`http://10.0.5.40:3014/`** to browse all saved boards; every editor also links back to this index. The index is derived from existing room snapshots, so boards created before the index was added remain discoverable. Its realtime search normalizes case and accents, supports fuzzy title/ID matching, and presents cards in two columns on wide screens. Like the current browser editor, the index is unauthenticated and must gain user authorization before production.

After checking out this branch on EMACS-30:

```sh
umask 077
printf 'PI_API_KEY=%s\n' "$(openssl rand -hex 32)" > .env
docker compose -f compose.emacs30.yaml up -d --build
```

Use the same token in the Pi client key file. Plain HTTP and the SDK development watermark make this a LAN development deployment, not a production deployment.

## Production gates

Do not expose this development service to operators or the Internet yet. A tldraw trial, commercial, or approved hobby license is required for production SDK use; a hobby license requires the watermark. See the [official licensing guide](https://tldraw.dev/community/license).

Before production, the remaining work includes browser room/asset authorization, safe network/reverse-proxy access, TLS, rate limiting and quotas, upload/unfurl hardening, retention and backups, idempotent API retries, and a tested persistence upgrade (for example `SQLiteSyncStorage` in a coordinated newer tldraw release). The original file-storage implementation has a short periodic-save window; API creation itself is flushed synchronously. Client and server tldraw versions must be upgraded together.

## Licensing

The wrapper retains the upstream MIT license. The tldraw SDK is source-available under its own [license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md), not a permissive open-source license. Development is allowed by the default terms; production requires an appropriate active license.
