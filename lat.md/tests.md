---
lat:
  require-code-mention: true
---
# Tests

These specifications protect the development API contract, SDK record compatibility, persistence, and explicit authentication boundary.

## Diagram translation

Diagram generation must produce editable records without allowing malformed caller data to reach the SDK.

### Produces compatible records

Verify that generated pages, shapes, and bindings can be loaded by the pinned SDK and retain the requested labels and relationships.

### Handles cyclic graphs

Verify that cycles do not hang layout generation or place multiple node origins at the same coordinates.

### Rejects malformed diagrams

Verify that empty graphs and references to missing nodes are rejected before tldraw record generation.

## Room persistence

The server must not report success before a generated board can be recovered from durable storage.

### Fails promptly on storage errors

Verify that an unwritable storage path rejects creation promptly instead of spinning or leaving an advertised board that cannot be recovered.

### Restores generated boards

Verify that creation writes the expected records, leaves one generated page, and supports reloading the saved room after closing the original.

### Lists persisted boards

Verify that a fresh store discovers existing snapshots by page title, supplies valid modification times, and skips malformed files without hiding healthy boards.

### Flushes live edits before listing

Verify that indexing persists a dirty browser room first so recent edits and newly created manual boards appear immediately.

## Board index

The browser index must expose persisted boards without depending on URLs retained by the operator.

### Returns persisted board summaries

Verify that the browser metadata endpoint returns the identity and title of a board created through the authenticated Pi API.

## Board search

Client-side search must remain responsive and forgiving while preserving predictable board ordering.

### Normalizes titles and search terms

Verify that case, accents, and multi-term queries match the intended titles and that unrelated queries return no boards.

### Matches fuzzy titles and IDs

Verify that ordered subsequences find titles and that identifiers remain searchable.

### Ranks matches and preserves default order

Verify that earlier exact title matches rank first and an empty query leaves the server's recency order unchanged.

## Pi board API

The HTTP boundary must fail closed and return a useful URL only after successful persistence.

### Requires bearer authentication

Verify that an unauthenticated creation request is rejected with a structured 401 response.

### Rejects invalid HTTP diagrams

Verify that an authenticated request with no nodes receives a 400 validation error instead of creating a room.

### Returns persisted board URLs

Verify that a valid request returns the expected board identity, URL, and SDK version and that its room can subsequently be loaded.

### Disabled by default

Verify that omitting the explicit API enablement setting leaves creation unavailable even when the rest of the server is running.

## Pi client API

The client must preserve the typed contract and avoid leaking credentials or creating duplicate boards through retries.

### Creates a board safely

Verify that the client sends the versioned contract and bearer token, returns the typed board result, and excludes the token from that result.

### Sanitizes HTTP errors

Verify that API errors remain useful without including the bearer credential.

### Rejects malformed results

Verify that an incomplete success response is not accepted as a created board.

### Honors cancellation

Verify that cancellation aborts the single request and does not trigger another creation attempt.

## Pi client configuration

Client configuration must support protected local secrets and predictable overrides.

### Loads protected file configuration

Verify that the development URL and a key file relative to the JSON configuration resolve correctly.

### Applies environment overrides

Verify that environment credentials take precedence without reading a configured key file.

### Explains missing configuration

Verify that a missing key produces actionable setup guidance before any network request.

## Pi extension

The extension must expose the intended model tool and preserve both human- and machine-readable results.

### Registers the diagram tool

Verify registration, tool annotations, structured board output, clickable URL text, and absence of credentials from the complete tool result.
