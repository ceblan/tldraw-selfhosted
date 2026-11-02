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
import type { DiagramEdge, DiagramNode, FlowchartDiagram } from './diagram.js'

const PAGE_ID = PageRecordType.createId('page')
const NODE_FONT_SIZE = 26
const EDGE_FONT_SIZE = 24
const MIN_NODE_WIDTH = 300
const MIN_NODE_HEIGHT = 140
const MAIN_GAP = 170
const CROSS_GAP = 130
const BAND_GAP = 280
const MAX_LAYERS_PER_BAND = 5

interface MeasuredText {
	text: string
	width: number
	height: number
}

interface NodeLayout {
	node: DiagramNode
	x: number
	y: number
	w: number
	h: number
	rank: number
	band: number
	label: MeasuredText
}

interface Anchor {
	x: number
	y: number
}

function characterWidth(character: string, fontSize: number): number {
	if (/\s/.test(character)) return fontSize * 0.34
	if (/[ilI.,'’:;!|]/.test(character)) return fontSize * 0.32
	if (/[mwMW@¿?]/.test(character)) return fontSize * 0.82
	if (/[A-ZÁÉÍÓÚÜÑ0-9]/.test(character)) return fontSize * 0.64
	return fontSize * 0.56
}

function textWidth(text: string, fontSize: number): number {
	return Array.from(text).reduce((width, character) => width + characterWidth(character, fontSize), 0)
}

function splitLongWord(word: string, maxWidth: number, fontSize: number): string[] {
	const parts: string[] = []
	let part = ''
	for (const character of Array.from(word)) {
		if (part && textWidth(part + character, fontSize) > maxWidth) {
			parts.push(part)
			part = character
		} else {
			part += character
		}
	}
	if (part) parts.push(part)
	return parts
}

/** Conservative server-side wrapping; the browser remains the final text renderer. */
function measureText(value: string, maxWidth: number, fontSize: number): MeasuredText {
	const lines: string[] = []
	for (const paragraph of value.split(/\r?\n/)) {
		let line = ''
		const words = paragraph.trim().split(/\s+/).filter(Boolean)
		for (const originalWord of words) {
			const wordsToAdd = textWidth(originalWord, fontSize) > maxWidth
				? splitLongWord(originalWord, maxWidth, fontSize)
				: [originalWord]
			for (const word of wordsToAdd) {
				const candidate = line ? `${line} ${word}` : word
				if (line && textWidth(candidate, fontSize) > maxWidth) {
					lines.push(line)
					line = word
				} else {
					line = candidate
				}
			}
		}
		if (line) lines.push(line)
	}
	const safeLines = lines.length > 0 ? lines : ['']
	return {
		text: safeLines.join('\n'),
		width: Math.max(...safeLines.map((line) => textWidth(line, fontSize))),
		height: safeLines.length * fontSize * 1.35,
	}
}

function measureNode(node: DiagramNode) {
	const wrapWidth = node.kind === 'diamond' ? 170 : node.kind === 'ellipse' ? 240 : 270
	const label = measureText(node.label, wrapWidth, NODE_FONT_SIZE)
	if (node.kind === 'diamond') {
		return {
			label,
			w: Math.max(360, label.width * 2 + 80),
			h: Math.max(210, label.height + 116),
		}
	}
	if (node.kind === 'ellipse') {
		return {
			label,
			w: Math.max(MIN_NODE_WIDTH, label.width * 1.35 + 72),
			h: Math.max(160, label.height + 88),
		}
	}
	return {
		label,
		w: Math.max(MIN_NODE_WIDTH, label.width + 72),
		h: Math.max(MIN_NODE_HEIGHT, label.height + 72),
	}
}

function graphRanks(diagram: FlowchartDiagram): Map<string, number> {
	const order = new Map(diagram.nodes.map((node, index) => [node.id, index]))
	const outgoing = new Map(diagram.nodes.map((node) => [node.id, [] as { to: string; index: number }[]]))
	diagram.edges.forEach((edge, index) => outgoing.get(edge.from)!.push({ to: edge.to, index }))
	for (const targets of outgoing.values()) targets.sort((a, b) => order.get(a.to)! - order.get(b.to)!)

	// Ignore DFS back edges for ranking. They are rendered separately as feedback loops.
	const state = new Map(diagram.nodes.map((node) => [node.id, 0]))
	const backEdges = new Set<number>()
	function visit(id: string) {
		state.set(id, 1)
		for (const { to, index } of outgoing.get(id)!) {
			if (state.get(to) === 1) {
				backEdges.add(index)
			} else if (state.get(to) === 0) {
				visit(to)
			}
		}
		state.set(id, 2)
	}
	for (const node of diagram.nodes) if (state.get(node.id) === 0) visit(node.id)

	const forwardOutgoing = new Map(diagram.nodes.map((node) => [node.id, [] as string[]]))
	const indegree = new Map(diagram.nodes.map((node) => [node.id, 0]))
	diagram.edges.forEach((edge, index) => {
		if (backEdges.has(index)) return
		forwardOutgoing.get(edge.from)!.push(edge.to)
		indegree.set(edge.to, indegree.get(edge.to)! + 1)
	})
	const rank = new Map(diagram.nodes.map((node) => [node.id, 0]))
	const originalIndegree = new Map(indegree)
	const queue = diagram.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id)
	for (let cursor = 0; cursor < queue.length; cursor++) {
		const from = queue[cursor]
		for (const to of forwardOutgoing.get(from)!) {
			rank.set(to, Math.max(rank.get(to)!, rank.get(from)! + 1))
			indegree.set(to, indegree.get(to)! - 1)
			if (indegree.get(to) === 0) queue.push(to)
		}
	}

	// A feeder into a converging node belongs beside that target, not at the far left.
	for (const node of diagram.nodes) {
		const targets = forwardOutgoing.get(node.id)!
		if (originalIndegree.get(node.id) !== 0 || targets.length !== 1) continue
		const target = targets[0]
		if ((originalIndegree.get(target) ?? 0) > 1) rank.set(node.id, rank.get(target)!)
	}
	return rank
}

function layoutNodes(diagram: FlowchartDiagram): Map<string, NodeLayout> {
	const ranks = graphRanks(diagram)
	const measurements = new Map(diagram.nodes.map((node) => [node.id, measureNode(node)]))
	const layers = [...new Set(ranks.values())].sort((a, b) => a - b)
	const hasFeedback = diagram.edges.some((edge) => (ranks.get(edge.to) ?? 0) < (ranks.get(edge.from) ?? 0))
	const layersPerBand = hasFeedback ? layers.length : MAX_LAYERS_PER_BAND
	const horizontal = diagram.layout !== 'vertical'
	const result = new Map<string, NodeLayout>()
	let bandOffset = 0

	for (let bandStart = 0; bandStart < layers.length; bandStart += layersPerBand) {
		const bandLayers = layers.slice(bandStart, bandStart + layersPerBand)
		let mainCursor = 0
		let bandCrossSize = 0
		for (const rank of bandLayers) {
			const nodes = diagram.nodes
				.filter((node) => ranks.get(node.id) === rank)
				.sort((a, b) => {
					const aHasLowerInput = diagram.edges.some(
						(edge) => edge.to === a.id && (ranks.get(edge.from) ?? rank) < rank,
					)
					const bHasLowerInput = diagram.edges.some(
						(edge) => edge.to === b.id && (ranks.get(edge.from) ?? rank) < rank,
					)
					return Number(bHasLowerInput) - Number(aHasLowerInput)
				})
			let crossCursor = bandOffset
			const maxMainSize = Math.max(
				...nodes.map((node) => {
					const size = measurements.get(node.id)!
					return horizontal ? size.w : size.h
				}),
			)
			for (const node of nodes) {
				const size = measurements.get(node.id)!
				result.set(node.id, {
					node,
					x: horizontal ? mainCursor : crossCursor,
					y: horizontal ? crossCursor : mainCursor,
					w: size.w,
					h: size.h,
					rank,
					band: Math.floor(bandStart / layersPerBand),
					label: size.label,
				})
				crossCursor += (horizontal ? size.h : size.w) + CROSS_GAP
			}
			bandCrossSize = Math.max(bandCrossSize, crossCursor - bandOffset - CROSS_GAP)
			mainCursor += maxMainSize + MAIN_GAP
		}
		bandOffset += bandCrossSize + BAND_GAP
	}
	return result
}

function anchorPoint(layout: NodeLayout, anchor: Anchor): Anchor {
	return { x: layout.x + layout.w * anchor.x, y: layout.y + layout.h * anchor.y }
}

function edgeTerminals(
	diagram: FlowchartDiagram,
	from: NodeLayout,
	to: NodeLayout,
): { from: Anchor; to: Anchor; kind: 'arc' | 'elbow'; backward: boolean } {
	const horizontal = diagram.layout !== 'vertical'
	const backward = to.rank < from.rank
	const sameBand = from.band === to.band
	if (backward) {
		return horizontal
			? { from: { x: 0.5, y: 1 }, to: { x: 0.5, y: 1 }, kind: 'elbow', backward }
			: { from: { x: 1, y: 0.5 }, to: { x: 1, y: 0.5 }, kind: 'elbow', backward }
	}
	if (!sameBand) {
		return horizontal
			? { from: { x: 0.5, y: 1 }, to: { x: 0.5, y: 0 }, kind: 'elbow', backward }
			: { from: { x: 1, y: 0.5 }, to: { x: 0, y: 0.5 }, kind: 'elbow', backward }
	}
	if (Math.abs(from.x - to.x) < 1) {
		return from.y < to.y
			? { from: { x: 0.5, y: 1 }, to: { x: 0.5, y: 0 }, kind: 'arc', backward }
			: { from: { x: 0.5, y: 0 }, to: { x: 0.5, y: 1 }, kind: 'arc', backward }
	}
	if (Math.abs(from.y - to.y) < 1) {
		return from.x < to.x
			? { from: { x: 1, y: 0.5 }, to: { x: 0, y: 0.5 }, kind: 'arc', backward }
			: { from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 }, kind: 'arc', backward }
	}
	return horizontal
		? { from: { x: 1, y: 0.5 }, to: { x: 0, y: 0.5 }, kind: 'elbow', backward }
		: { from: { x: 0.5, y: 1 }, to: { x: 0.5, y: 0 }, kind: 'elbow', backward }
}

function boxesOverlap(a: Anchor & { w: number; h: number }, b: Anchor & { w: number; h: number }) {
	return a.x < b.x + b.w + 12 && a.x + a.w + 12 > b.x && a.y < b.y + b.h + 12 && a.y + a.h + 12 > b.y
}

/** Translate a semantic diagram into schema-validated document records, not raw caller JSON. */
// @lat: [[architecture#Diagram translation]]
export function diagramToRecords(diagram: FlowchartDiagram): TLRecord[] {
	const schema = createTLSchema()
	const page = PageRecordType.create({ id: PAGE_ID, name: diagram.title, index: 'a1' as IndexKey })
	const shapeIds = new Map(diagram.nodes.map((node) => [node.id, createShapeId(`pi-${node.id}`)]))
	const layout = layoutNodes(diagram)
	const labeledEdges = diagram.edges.filter((edge) => edge.label)
	const indices = getIndices(diagram.nodes.length + diagram.edges.length + labeledEdges.length)
	const records: TLRecord[] = [page]
	const edgeLabels: { edge: DiagramEdge; label: MeasuredText; x: number; y: number }[] = []

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
					w: point.w,
					h: point.h,
					growY: 0,
					scale: 1,
					labelColor: 'black',
					color: node.color ?? 'black',
					fill: 'solid',
					size: 'l',
					font: 'sans',
					align: 'middle',
					verticalAlign: 'middle',
					richText: toRichText(point.label.text),
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
		const terminals = edgeTerminals(diagram, from, to)
		records.push(
			schema.types.shape.create({
				id: arrowId,
				type: 'arrow',
				parentId: PAGE_ID,
				index: indices[diagram.nodes.length + index],
				x: from.x + from.w / 2,
				y: from.y + from.h / 2,
				props: {
					kind: terminals.kind,
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
					richText: toRichText(''),
					labelPosition: 0.5,
					scale: 1,
					elbowMidPoint: 0.5,
				},
			}),
		)
		for (const [terminal, targetId, normalizedAnchor] of [
			['start', fromId, terminals.from],
			['end', toId, terminals.to],
		] as const) {
			records.push(
				schema.types.binding.create({
					id: createBindingId(`pi-edge-${index}-${terminal}`),
					type: 'arrow',
					fromId: arrowId,
					toId: targetId,
					props: {
						terminal,
						normalizedAnchor,
						isExact: false,
						isPrecise: true,
						snap: 'none',
					},
				}),
			)
		}

		if (!edge.label) return
		const label = measureText(edge.label, 240, EDGE_FONT_SIZE)
		const start = anchorPoint(from, terminals.from)
		const end = anchorPoint(to, terminals.to)
		const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
		let candidates: Anchor[]
		if (terminals.backward) {
			candidates = diagram.layout === 'vertical'
				? [{ x: Math.max(from.x + from.w, to.x + to.w) + 100, y: middle.y - label.height / 2 }]
				: [{ x: middle.x - label.width / 2, y: Math.max(from.y + from.h, to.y + to.h) + 100 }]
		} else if (from.band !== to.band) {
			candidates = diagram.layout === 'vertical'
				? [
						{ x: start.x - label.width / 2, y: start.y + 32 },
						{ x: start.x - label.width / 2, y: start.y - label.height - 32 },
					]
				: [
						{ x: start.x + 32, y: start.y + 16 },
						{ x: start.x - label.width - 32, y: start.y + 16 },
						{ x: end.x + 32, y: end.y - label.height - 16 },
					]
		} else if (Math.abs(start.x - end.x) < 1) {
			candidates = [
				{ x: middle.x + 32, y: middle.y - label.height / 2 },
				{ x: middle.x - label.width - 32, y: middle.y - label.height / 2 },
			]
		} else if (Math.abs(start.y - end.y) < 1) {
			candidates = [
				{ x: middle.x - label.width / 2, y: middle.y - label.height - 28 },
				{ x: middle.x - label.width / 2, y: middle.y + 28 },
			]
		} else {
			candidates = [
				{ x: middle.x - label.width / 2, y: middle.y - label.height - 32 },
				{ x: middle.x - label.width / 2, y: middle.y + 32 },
				{ x: middle.x + 40, y: middle.y - label.height / 2 },
			]
		}
		const occupied = [...layout.values()]
		const point = candidates.find(
			(candidate) =>
				!occupied.some((node) => boxesOverlap({ ...candidate, w: label.width, h: label.height }, node)) &&
				!edgeLabels.some((other) =>
					boxesOverlap(
						{ ...candidate, w: label.width, h: label.height },
						{ x: other.x, y: other.y, w: other.label.width, h: other.label.height },
					),
				),
		) ?? candidates[0]
		edgeLabels.push({ edge, label, x: point.x, y: point.y })
	})

	edgeLabels.forEach(({ edge, label, x, y }, index) => {
		records.push(
			schema.types.shape.create({
				id: createShapeId(`pi-edge-label-${diagram.edges.indexOf(edge)}`),
				type: 'text',
				parentId: PAGE_ID,
				index: indices[diagram.nodes.length + diagram.edges.length + index],
				x,
				y,
				props: {
					color: 'black',
					size: 'm',
					font: 'sans',
					textAlign: 'middle',
					w: label.width + 8,
					richText: toRichText(label.text),
					scale: 1,
					autoSize: false,
				},
			}),
		)
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
