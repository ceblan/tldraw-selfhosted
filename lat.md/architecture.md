# Architecture

This development fork adds a Pi-facing control plane to the existing tldraw editor and collaboration server without changing the hosted tldraw.com account model.

## Semantic diagram contract

Pi sends a small versioned flowchart model instead of arbitrary SDK records so validation, layout, and schema migrations remain server-owned.

[[src/server/diagram.ts#parseDiagram]] accepts only `flowchart-v1`, limits graph size and text length, verifies unique node identifiers, and rejects dangling edges. This is the stable integration boundary for a future Pi extension or skill.

## Diagram translation

The server converts the semantic model into ordinary tldraw pages, shapes, and arrow bindings with a deterministic layered layout.

[[src/server/diagram-records.ts#diagramToRecords]] uses the exact tldraw 4.0.2 schema and record constructors. Cycles are placed in fallback layers rather than causing an unbounded topological walk. Browser rendering remains responsible for final arrow geometry and visual editing.

## Pi board API

An explicitly enabled bearer-authenticated endpoint creates a board and returns its editor URL, document clock, and SDK version.

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

A local Pi package pairs semantic diagram guidance with an executable client that returns an editable board URL.

[[pi/tldraw/extensions/tldraw-create-diagram.ts#tldrawExtension]] registers `tldraw_create_diagram`; the bundled `tldraw-diagrams` skill guides semantic extraction. [[pi/tldraw/src/api.ts#createBoard]] performs one bounded HTTP request without automatic retries, validates the response, and returns structured output without credentials.

## Client configuration

The Pi client resolves its URL and service token only when the tool executes, keeping secrets outside source control and board URLs.

[[pi/tldraw/src/config.ts#resolveConfig]] supports environment overrides and a protected JSON configuration with a separate key file. Relative key paths resolve beside that configuration, and changing a key does not require an extension reload.

## Development deployment

A separate Compose service publishes the development server on the EMACS-30 LAN address at port 3014 with an isolated persistent volume.

`compose.emacs30.yaml` configures the returned board URL and an exact same-origin CORS policy. The hobby-licensed client retains the required made-with-tldraw watermark. Browser validation requires a secure context such as HTTPS or localhost; plain LAN HTTP lacks Web Crypto and shows the development watermark even when the key is present. This is not production hardening, and the existing container on port 3012 remains independent.

## Licensing and production gates

Development and isolated tests can proceed without a production key, but production SDK use requires an appropriate tldraw license.

Room/asset authorization, TLS, safe remote access, rate limits, quotas, upload/unfurl hardening, retention, backups, and coordinated SDK upgrades remain production gates. An approved hobby license is not itself an implementation of these controls.
