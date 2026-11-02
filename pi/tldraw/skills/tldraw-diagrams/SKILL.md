---
name: tldraw-diagrams
description: Create editable tldraw flowcharts, inspect their real PNG previews, revise them in place, and return their board URLs. Use when the operator explicitly asks for a visual diagram or editable tldraw board; not for Mermaid, static images, or unrequested diagrams.
---

# tldraw diagrams

Use `tldraw_create_diagram` for a new board and `tldraw_update_diagram` for visual revisions. Do not use HTTP requests, shell scripts, or browser automation as a substitute for these tools. Browser inspection of an existing board is only a fallback when the attached preview is unavailable.

## Build the diagram

1. Identify only the concepts and relationships the operator actually wants represented. Do not invent extra architecture or causal claims.
2. Write a concise title and 1–50 nodes. Give every node a stable, unique id containing only letters, numbers, `_`, or `-`.
3. Use short visible labels. Prefer `rectangle` for ordinary steps/entities, `diamond` for decisions, and `ellipse` for starts, ends, or events. Use color sparingly to distinguish meaningful roles.
4. Add at most 100 directed edges using the node ids. Include an edge label only when it clarifies the relationship; keep labels short and avoid unnecessary feedback edges.
5. Choose `horizontal` for a left-to-right process and `vertical` for a top-to-bottom flow or hierarchy. Omit layout to use horizontal. Long acyclic flows may be arranged in multiple bands; graphs with feedback remain in one band to keep return paths clear.
6. Call `tldraw_create_diagram` once with `title`, `nodes`, optional `edges`, and optional `layout`. The extension adds the server contract version and credentials. The server sizes and wraps labels, creates explicit arrow bindings, and places edge labels away from connector lines.

Example parameters for a requested deployment-flow diagram:

```json
{
  "title": "Deployment flow",
  "layout": "horizontal",
  "nodes": [
    { "id": "change", "label": "Code change", "color": "blue" },
    { "id": "review", "label": "Review", "kind": "diamond" },
    { "id": "deploy", "label": "Deploy", "color": "green" }
  ],
  "edges": [
    { "from": "change", "to": "review" },
    { "from": "review", "to": "deploy", "label": "approved" }
  ]
}
```

## Inspect and revise before delivery

1. The tool returns a `boardId`, URL, and a PNG exported from the real tldraw editor. **Look at the attached image before returning the URL.** A successful HTTP response is not visual validation.
2. Check semantic completeness, readable font size, labels fitting inside shapes, consistent spacing, and every connector. Reject results with lines crossing text or unrelated shapes, ambiguous arrow directions, clipped text, or large accidental gaps.
3. If anything needs adjustment, call `tldraw_update_diagram` with the returned `boardId` and the complete revised semantic diagram. This replaces the generated board in place and preserves its URL. Do not create a duplicate board for a revision.
4. Inspect the updated PNG and repeat the revision step if necessary. Return only the final reviewed URL. Updating replaces pages, shapes, and bindings; never use it to overwrite unauthorized manual edits.
5. If no PNG is attached, or image inspection is unavailable, explicitly say that visual review could not be completed. Do not claim the diagram was reviewed. Inspect the existing board in a browser if available; never retry creation blindly just to obtain a preview.

The installed tldraw 4.0.2 rectangle has no configurable corner radius. Do not promise rounded rectangles or current-version SDK features without first upgrading and validating the client and server together.

## Return the result

Return the final URL as a clickable Markdown link, with a short statement that the board is editable and visually reviewed. Do not print credentials, internal configuration, raw HTTP headers, or base64 image data.

If creation or update fails, report the sanitized tool error. Creation is not idempotent and must not be retried automatically; a retry can create duplicate boards after a request has reached the server.

Do not use this skill for Mermaid source, static chart generation, rich HTML explainers, or diagrams the operator did not request.
