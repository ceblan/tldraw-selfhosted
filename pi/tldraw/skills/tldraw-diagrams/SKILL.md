---
name: tldraw-diagrams
description: Create editable tldraw flowcharts and return their board URLs. Use when the operator explicitly asks to represent an answer, process, architecture, or relationships visually as an editable tldraw board. Uses the tldraw_create_diagram tool; not for Mermaid, static images, or unrequested diagrams.
---

# tldraw diagrams

Use `tldraw_create_diagram` to create one editable board from a semantic flowchart. Do not use HTTP requests, shell scripts, or browser automation as a substitute for the tool.

## Build the diagram

1. Identify the concepts and relationships that the operator actually wants represented. Do not invent extra architecture or causal claims.
2. Write a concise title and 1–50 nodes. Give every node a stable, unique id containing only letters, numbers, `_`, or `-`.
3. Use short visible labels. Prefer `rectangle` for ordinary steps/entities, `diamond` for decisions, and `ellipse` for starts, ends, or events. Use color sparingly to distinguish meaningful roles.
4. Add at most 100 directed edges using the node ids. Include an edge label only when it clarifies the relationship.
5. Choose `horizontal` for a left-to-right process and `vertical` for a top-to-bottom flow or hierarchy. Omit layout to use horizontal.
6. Call the tool once with `title`, `nodes`, optional `edges`, and optional `layout`. The extension adds the server contract version and credentials.

## Return the result

Return the URL from the tool as a clickable Markdown link, with a short statement that the board is editable. Do not print credentials, internal configuration, or raw HTTP headers.

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

If creation fails, report the sanitized tool error and do not repeatedly retry: retries can create duplicate boards once a request has reached the server.

Do not use this skill for Mermaid source, static chart generation, rich HTML explainers, or diagrams the operator did not request.
