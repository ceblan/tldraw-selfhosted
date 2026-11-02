import { Store } from '@tldraw/store'
import {
	PageRecordType,
	TLRecord,
	TLShapeId,
	createBindingId,
	createShapeId,
	createTLSchema,
	toRichText,
} from '@tldraw/tlschema'
import { IndexKey, getIndices } from '@tldraw/utils'
import type { FlowchartDiagram } from './diagram.js'

const PAGE_ID = PageRecordType.createId('page')
const NODE_WIDTH = 240
const NODE_HEIGHT = 100
const COLUMN_GAP = 220
const ROW_GAP = 100

function positions(diagram: FlowchartDiagram) {
	const order = new Map(diagram.nodes.map((node, index) => [node.id, index]))
	const outgoing = new Map(diagram.nodes.map((node) => [node.id, [] as string[]]))
	const indegree = new Map(diagram.nodes.map((node) => [node.id, 0]))
	for (const edge of diagram.edges) {
		outgoing.get(edge.from)!.push(edge.to)
		indegree.set(edge.to, indegree.get(edge.to)! + 1)
	}
	for (const targets of outgoing.values()) {
		targets.sort((a, b) => order.get(a)! - order.get(b)!)
	}

	// Longest-path layers preserve source order and never deadlock on a cyclic graph.
	const rank = new Map(diagram.nodes.map((node) => [node.id, 0]))
	const queue = diagram.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
	const visited = new Set<string>()
	for (let cursor = 0; cursor < queue.length; cursor++) {
		const from = queue[cursor]
		visited.add(from)
		for (const to of outgoing.get(from)!) {
			rank.set(to, Math.max(rank.get(to)!, rank.get(from)! + 1))
			indegree.set(to, indegree.get(to)! - 1)
			if (indegree.get(to) === 0) queue.push(to)
		}
	}
	let nextRank = Math.max(0, ...rank.values()) + 1
	for (const node of diagram.nodes) {
		if (!visited.has(node.id)) rank.set(node.id, nextRank++)
	}

	const rows = new Map<number, number>()
	return new Map(
		diagram.nodes.map((node) => {
			const layer = rank.get(node.id)!
			const index = rows.get(layer) ?? 0
			rows.set(layer, index + 1)
			const first = layer * (NODE_WIDTH + COLUMN_GAP)
			const second = index * (NODE_HEIGHT + ROW_GAP)
			return [node.id, diagram.layout === 'vertical' ? { x: second, y: first } : { x: first, y: second }]
		}),
	)
}

/** Translate a semantic diagram into schema-validated document records, not raw caller JSON. */
// @lat: [[architecture#Diagram translation]]
export function diagramToRecords(diagram: FlowchartDiagram): TLRecord[] {
	const schema = createTLSchema()
	const page = PageRecordType.create({ id: PAGE_ID, name: diagram.title, index: 'a1' as IndexKey })
	const shapeIds = new Map(diagram.nodes.map((node) => [node.id, createShapeId(`pi-${node.id}`)]))
	const layout = positions(diagram)
	const indices = getIndices(diagram.nodes.length + diagram.edges.length)
	const records: TLRecord[] = [page]

	diagram.nodes.forEach((node, index) => {
		const point = layout.get(node.id)!
		records.push(
			schema.types.shape.create({
				id: shapeIds.get(node.id),
				type: 'geo',
				parentId: PAGE_ID,
				index: indices[index],
				x: point.x,
				y: point.y,
				props: {
					geo: node.kind ?? 'rectangle',
					dash: 'solid',
					url: '',
					w: NODE_WIDTH,
					h: NODE_HEIGHT,
					growY: 0,
					scale: 1,
					labelColor: 'black',
					color: node.color ?? 'black',
					fill: 'solid',
					size: 'm',
					font: 'sans',
					align: 'middle',
					verticalAlign: 'middle',
					richText: toRichText(node.label),
				},
			}),
		)
	})

	diagram.edges.forEach((edge, index) => {
		const arrowId = createShapeId(`pi-edge-${index}`)
		const fromId = shapeIds.get(edge.from)!
		const toId = shapeIds.get(edge.to)!
		const from = layout.get(edge.from)!
		const to = layout.get(edge.to)!
		records.push(
			schema.types.shape.create({
				id: arrowId,
				type: 'arrow',
				parentId: PAGE_ID,
				index: indices[diagram.nodes.length + index],
				x: from.x + NODE_WIDTH / 2,
				y: from.y + NODE_HEIGHT / 2,
				props: {
					kind: 'arc',
					labelColor: 'black',
					color: 'black',
					fill: 'none',
					dash: 'solid',
					size: 'm',
					arrowheadStart: 'none',
					arrowheadEnd: 'arrow',
					font: 'sans',
					start: { x: 0, y: 0 },
					end: { x: to.x - from.x, y: to.y - from.y },
					bend: 0,
					richText: toRichText(edge.label ?? ''),
					labelPosition: 0.5,
					scale: 1,
					elbowMidPoint: 0.5,
				},
			}),
		)
		for (const [terminal, targetId] of [
			['start', fromId],
			['end', toId],
		] as const) {
			records.push(
				schema.types.binding.create({
					id: createBindingId(`pi-edge-${index}-${terminal}`),
					type: 'arrow',
					fromId: arrowId,
					toId: targetId,
					props: {
						terminal,
						normalizedAnchor: { x: 0.5, y: 0.5 },
						isExact: false,
						isPrecise: false,
						snap: 'none',
					},
				}),
			)
		}
	})

	return records
}

export function diagramToSnapshot(diagram: FlowchartDiagram) {
	const schema = createTLSchema()
	const store = new Store({
		schema,
		props: {
			defaultName: diagram.title,
			onMount: () => {},
			assets: {
				upload: async () => {
					throw new Error('Asset upload is not supported by the diagram generator')
				},
				resolve: (asset) => asset.props.src,
				remove: async () => {},
			},
		},
	})
	store.put(diagramToRecords(diagram))
	return store.getStoreSnapshot('document')
}

export function shapeIdForNode(id: string): TLShapeId {
	return createShapeId(`pi-${id}`)
}
