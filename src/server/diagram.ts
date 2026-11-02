export const DIAGRAM_KIND = 'flowchart-v1' as const
export const TLDRAW_SDK_VERSION = '4.0.2' as const

const NODE_KINDS = ['rectangle', 'ellipse', 'diamond'] as const
const COLORS = ['black', 'grey', 'blue', 'green', 'yellow', 'orange', 'red', 'violet'] as const

export type DiagramNodeKind = (typeof NODE_KINDS)[number]
export type DiagramColor = (typeof COLORS)[number]

export interface DiagramNode {
	id: string
	label: string
	kind?: DiagramNodeKind
	color?: DiagramColor
}

export interface DiagramEdge {
	from: string
	to: string
	label?: string
}

export interface FlowchartDiagram {
	kind: typeof DIAGRAM_KIND
	title: string
	nodes: DiagramNode[]
	edges: DiagramEdge[]
	layout?: 'horizontal' | 'vertical'
}

export class DiagramValidationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'DiagramValidationError'
	}
}

function fail(message: string): never {
	throw new DiagramValidationError(message)
}

function record(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		fail(`${path} must be an object`)
	}
	return value as Record<string, unknown>
}

function text(value: unknown, path: string, maxLength: number): string {
	if (typeof value !== 'string' || !value.trim()) fail(`${path} must be a non-empty string`)
	const result = value.trim()
	if (result.length > maxLength) fail(`${path} must not exceed ${maxLength} characters`)
	return result
}

function member<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	if (value === undefined) return fallback
	if (!allowed.includes(value as T)) fail(`must be one of: ${allowed.join(', ')}`)
	return value as T
}

/** Validate the versioned Pi-facing contract rather than accepting raw SDK records. */
// @lat: [[architecture#Semantic diagram contract]]
export function parseDiagram(input: unknown): FlowchartDiagram {
	const root = record(input, 'diagram')
	if (root.kind !== DIAGRAM_KIND) fail(`kind must be ${DIAGRAM_KIND}`)
	const title = text(root.title, 'title', 160)
	const layout = member(root.layout, ['horizontal', 'vertical'] as const, 'horizontal')

	if (!Array.isArray(root.nodes) || root.nodes.length < 1 || root.nodes.length > 50) {
		fail('nodes must contain between 1 and 50 items')
	}
	if (!Array.isArray(root.edges) || root.edges.length > 100) {
		fail('edges must be an array containing at most 100 items')
	}

	const nodeIds = new Set<string>()
	const nodes = root.nodes.map((value, index): DiagramNode => {
		const node = record(value, `nodes[${index}]`)
		const id = text(node.id, `nodes[${index}].id`, 64)
		if (!/^[a-zA-Z0-9_-]+$/.test(id)) fail(`nodes[${index}].id contains invalid characters`)
		if (nodeIds.has(id)) fail(`duplicate node id: ${id}`)
		nodeIds.add(id)
		return {
			id,
			label: text(node.label, `nodes[${index}].label`, 240),
			kind: member(node.kind, NODE_KINDS, 'rectangle'),
			color: member(node.color, COLORS, 'black'),
		}
	})

	const edges = root.edges.map((value, index): DiagramEdge => {
		const edge = record(value, `edges[${index}]`)
		const from = text(edge.from, `edges[${index}].from`, 64)
		const to = text(edge.to, `edges[${index}].to`, 64)
		if (!nodeIds.has(from) || !nodeIds.has(to)) {
			fail(`edges[${index}] references an unknown node`)
		}
		return {
			from,
			to,
			label: edge.label === undefined ? undefined : text(edge.label, `edges[${index}].label`, 160),
		}
	})

	return { kind: DIAGRAM_KIND, title, layout, nodes, edges }
}
