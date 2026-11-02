# Architecture

This development fork adds a Pi-facing control plane to the existing tldraw editor and collaboration server without changing the hosted tldraw.com account model.

## Semantic diagram contract

Pi sends a small versioned flowchart model instead of arbitrary SDK records so validation, layout, and schema migrations remain server-owned.

[[src/server/diagram.ts#parseDiagram]] accepts only `flowchart-v1`, limits graph size and text length, verifies unique node identifiers, and rejects dangling edges. This is the stable integration boundary for a future Pi extension or skill.

## Diagram translation

The server converts the semantic model into ordinary tldraw pages, shapes, text labels, and arrow bindings with deterministic layered layout and conservative text sizing.

[[src/server/diagram-records.ts#diagramToRecords]] uses the exact tldraw 4.0.2 schema and record constructors. Large wrapped nodes reduce clipping, long acyclic flows use bands, feedback stays in one band, explicit anchors route elbow returns, and detached text labels avoid lines through text. Browser rendering remains responsible for final geometry and visual editing.

## Visual preview

The Pi extension attaches a real PNG export so the model must inspect the board before presenting it as finished.

[[pi/tldraw/src/preview.ts#renderBoardPreview]] drives local headless Chromium through CDP and calls tldraw's browser-only `editor.toImage()` API. It exports the synchronized page without editor chrome, bounds image size, and cleans up its temporary browser profile. Preview failure preserves the saved board URL and never triggers another creation request.

## Visual revision workflow

A generated board can be replaced in place after visual review, preserving its public URL and avoiding duplicate boards.

[[src/server/rooms.ts#RoomStore#updateBoard]] replaces pages, shapes, and bindings through the authoritative live room and flushes before responding. [[pi/tldraw/src/api.ts#updateBoard]] sends one authenticated PUT. The update is destructive rather than a merge with manual edits, and a missing generated board returns 404.

## Pi board API

An explicitly enabled bearer-authenticated endpoint creates or replaces a board and returns its editor URL, document clock, and SDK version.

[[src/server/pi-api.ts#registerPiApi]] owns request parsing, size limits, authentication, and structured errors. The service token never appears in the returned URL. The API is disabled by default and does not authenticate the separate browser collaboration plane.

## Room persistence

Generated records are committed through the authoritative live room and saved before the API advertises a board URL.

[[src/server/rooms.ts#RoomStore#createBoard]] replaces the SDK's initial blank page and uses one `TLSocketRoom.updateStore()` transaction. Snapshot files are replaced atomically. Other processes must not write these files while the server is live.

## Board registry

The root route lists every durable room snapshot and each editor links back to that index, so boards do not depend on saved URLs.

[[src/server/rooms.ts#RoomStore#listBoards]] flushes dirty live rooms, then reads titles and modification times without loading rooms or creating missing ones. Malformed snapshots are skipped individually. `GET /api/boards` serves this metadata to the browser plane; like the editor, it is unauthenticated in the LAN development environment and requires user authorization before production.

## Board search

The index filters locally on every keystroke across titles and IDs, with exact and subsequence fuzzy matching and responsive two-column cards.

[[src/client/board-search.ts#filterBoards]] normalizes case and accents, supports multi-term queries, ranks exact matches first, and preserves recency order when the query is empty. Filtering performs no network requests; the UI includes a live result count, clear control, and an explicit no-results state.

## Delivery boundary

The local Compose stack is a disposable development environment bound to loopback with an isolated data volume.

The build uses a frozen dependency lockfile, a digest-pinned Node base image, a non-root runtime, and an optional BuildKit secret for a future license key. The existing EMACS-30 container and its volumes are outside this milestone.

## Pi client package

A local Pi package pairs semantic diagram guidance with executable create/update clients, editable URLs, and visual previews.

[[pi/tldraw/extensions/tldraw-create-diagram.ts#tldrawExtension]] registers `tldraw_create_diagram` and `tldraw_update_diagram`; the bundled `tldraw-diagrams` skill requires create → inspect → revise → inspect before delivery. [[pi/tldraw/src/api.ts#createBoard]] performs bounded HTTP requests without automatic retries, validates responses, and returns structured output without credentials.

## Client configuration

The Pi client resolves its URL and service token only when the tool executes, keeping secrets outside source control and board URLs.

[[pi/tldraw/src/config.ts#resolveConfig]] supports environment overrides and a protected JSON configuration with a separate key file. Relative key paths resolve beside that configuration, and changing a key does not require an extension reload. Preview is enabled by default, with opt-out and Chromium-path settings; it requires a browser only during tool execution.

## Development deployment

Traefik terminates internal HTTPS for tldraw at `https://tldraw.iterando.net`, resolved locally to EMACS-30 without Internet exposure or a direct 3014 listener.

`compose.emacs30-traefik.yaml` combines both services on an isolated network and reuses the existing persistent volume. Port 80 redirects to port 443. Static file-provider routing avoids mounting the Docker socket or exposing a dashboard. `compose.emacs30.yaml` remains the legacy HTTP rollback path; the original port 3012 container and other services remain independent.

## Internal CA and client trust

An internal root CA signs the tldraw certificate, while its private key and the service key stay outside source control.

`scripts/generate-emacs30-lan-cert.sh` creates or reuses the workstation CA and emits a SAN certificate for `tldraw.iterando.net` and `10.0.5.40`. Only the server certificate/key are copied to the ignored `.traefik/certs` directory on EMACS-30. Browsers trust the public root certificate; Node-based Pi processes additionally require `NODE_EXTRA_CA_CERTS` at startup.

## Licensing and production gates

Development and isolated tests can proceed without a production key, but production SDK use requires an appropriate tldraw license.

An approved hobby license covers personal/non-commercial production within its host and validity conditions and requires the watermark; it authorizes the same SDK rather than unlocking another API. Room/asset authorization, safe public exposure, rate limits, quotas, upload/unfurl hardening, retention, backups, and coordinated SDK upgrades remain production gates.
