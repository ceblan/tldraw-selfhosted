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
