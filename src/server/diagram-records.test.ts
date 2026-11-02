import { TLSocketRoom } from '@tldraw/sync-core'
import { toRichText } from '@tldraw/tlschema'
import { describe, expect, it } from 'vitest'
import { diagramToRecords, diagramToSnapshot, shapeIdForNode } from './diagram-records.js'
import { parseDiagram } from './diagram.js'

const diagram = parseDiagram({
	kind: 'flowchart-v1',
	title: 'Pi request flow',
	nodes: [
		{ id: 'operator', label: 'Operator', color: 'blue' },
		{ id: 'pi', label: 'Pi', kind: 'diamond' },
		{ id: 'board', label: 'tldraw board' },
	],
	edges: [
		{ from: 'operator', to: 'pi', label: 'ask' },
		{ from: 'pi', to: 'board' },
	],
})

describe('semantic diagram translation', () => {
	// @lat: [[tests#Diagram translation#Produces compatible records]]
	it('creates schema-compatible shapes and arrow bindings', () => {
		const room = new TLSocketRoom({ initialSnapshot: diagramToSnapshot(diagram) })
		try {
			const node = room.getRecord(shapeIdForNode('operator'))!
			expect(node).toMatchObject({ typeName: 'shape', type: 'geo', x: 0, y: 0 })
			expect((node as any).props.richText).toEqual(toRichText('Operator'))
			expect((node as any).props.w).toBeGreaterThanOrEqual(300)
			expect((node as any).props.h).toBeGreaterThanOrEqual(140)
			expect((node as any).props.size).toBe('l')
			const records = room.getCurrentSnapshot().documents.map((entry) => entry.state)
			expect(records.filter((record) => record.typeName === 'shape')).toHaveLength(6)
			expect(records.filter((record) => record.typeName === 'binding')).toHaveLength(4)
			const edgeLabel = records.find(
				(record) => record.typeName === 'shape' && (record as any).type === 'text',
			)
			expect((edgeLabel as any).props.richText).toEqual(toRichText('ask'))
			const arrows = records.filter(
				(record) => record.typeName === 'shape' && (record as any).type === 'arrow',
			)
			expect(arrows.every((arrow: any) => arrow.props.richText.content[0].content === undefined)).toBe(true)
		} finally {
			room.close()
		}
	})

	// @lat: [[tests#Diagram translation#Handles cyclic graphs]]
	it('lays out cyclic graphs without dropping nodes or overlapping their origins', () => {
		const records = diagramToRecords(
			parseDiagram({
				kind: 'flowchart-v1',
				title: 'Cycle',
				nodes: ['a', 'b', 'c'].map((id) => ({ id, label: id })),
				edges: [
					{ from: 'a', to: 'b' },
					{ from: 'b', to: 'c' },
					{ from: 'c', to: 'a' },
				],
			}),
		)
		const nodes = records.filter((record) => record.typeName === 'shape' && (record as any).type === 'geo')
		expect(nodes).toHaveLength(3)
		expect(new Set(nodes.map((node: any) => `${node.x},${node.y}`)).size).toBe(3)
		const arrows = records.filter((record) => record.typeName === 'shape' && (record as any).type === 'arrow')
		expect(arrows.some((arrow: any) => arrow.props.kind === 'elbow')).toBe(true)
	})

	// @lat: [[tests#Diagram translation#Rejects malformed diagrams]]
	it('rejects malformed contracts and dangling edges before reaching the SDK', () => {
		expect(() => parseDiagram({ kind: 'flowchart-v1', title: 'Bad', nodes: [], edges: [] })).toThrow(
			/nodes must contain/,
		)
		expect(() =>
			parseDiagram({
				kind: 'flowchart-v1',
				title: 'Bad',
				nodes: [{ id: 'a', label: 'A' }],
				edges: [{ from: 'a', to: 'missing' }],
			}),
		).toThrow(/unknown node/)
	})
})
