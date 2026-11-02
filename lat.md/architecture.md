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

## Delivery boundary

The local Compose stack is a disposable development environment bound to loopback with an isolated data volume.

The build uses a frozen dependency lockfile, a digest-pinned Node base image, a non-root runtime, and an optional BuildKit secret for a future license key. The existing EMACS-30 container and its volumes are outside this milestone.

## Licensing and production gates

Development and isolated tests can proceed without a production key, but production SDK use requires an appropriate tldraw license.

Room/asset authorization, TLS, safe remote access, rate limits, quotas, upload/unfurl hardening, retention, backups, and coordinated SDK upgrades remain production gates. An approved hobby license is not itself an implementation of these controls.
