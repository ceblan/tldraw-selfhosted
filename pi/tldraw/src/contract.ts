import { StringEnum, Type } from "@earendil-works/pi-ai";
import type { Static } from "typebox";

export const diagramParameters = Type.Object({
	title: Type.String({ minLength: 1, maxLength: 160, description: "Short diagram title" }),
	nodes: Type.Array(
		Type.Object({
			id: Type.String({
				minLength: 1,
				maxLength: 64,
				pattern: "^[a-zA-Z0-9_-]+$",
				description: "Stable unique node identifier",
			}),
			label: Type.String({ minLength: 1, maxLength: 240, description: "Visible node label" }),
			kind: Type.Optional(StringEnum(["rectangle", "ellipse", "diamond"])),
			color: Type.Optional(
				StringEnum(["black", "grey", "blue", "green", "yellow", "orange", "red", "violet"]),
			),
		}),
		{ minItems: 1, maxItems: 50 },
	),
	edges: Type.Optional(
		Type.Array(
			Type.Object({
				from: Type.String({ description: "Source node id" }),
				to: Type.String({ description: "Target node id" }),
				label: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
			}),
			{ maxItems: 100, default: [] },
		),
	),
	layout: Type.Optional(StringEnum(["horizontal", "vertical"])),
});

export const updateDiagramParameters = Type.Object({
	boardId: Type.String({
		pattern: "^pi-[a-zA-Z0-9_-]+$",
		maxLength: 132,
		description: "Existing generated board id to replace after visual review",
	}),
	...diagramParameters.properties,
});

export const boardResultSchema = Type.Object({
	boardId: Type.String(),
	url: Type.String({ format: "uri" }),
	snapshotVersion: Type.Number(),
	tldrawSdkVersion: Type.String(),
});

export type DiagramInput = Static<typeof diagramParameters>;
export type UpdateDiagramInput = Static<typeof updateDiagramParameters>;
export type BoardResult = Static<typeof boardResultSchema>;
