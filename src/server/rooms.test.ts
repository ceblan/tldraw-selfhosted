import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { shapeIdForNode } from './diagram-records.js'
import { parseDiagram } from './diagram.js'
import { RoomStore } from './rooms.js'

let directory: string
let stores: RoomStore[]

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'tldraw-rooms-test-'))
	stores = []
})

afterEach(async () => {
	await Promise.all(stores.map((store) => store.dispose()))
	await rm(directory, { recursive: true, force: true })
})

describe('room persistence', () => {
	// @lat: [[tests#Room persistence#Fails promptly on storage errors]]
	it('fails creation promptly when persistence cannot write', async () => {
		const file = join(directory, 'not-a-directory')
		await writeFile(file, 'fixture')
		const store = new RoomStore(join(file, 'rooms'), 60_000)
		stores.push(store)
		let timeout: NodeJS.Timeout | undefined
		try {
			await expect(
				Promise.race([
					store.createBoard(
						parseDiagram({
							kind: 'flowchart-v1',
							title: 'Unwritable',
							nodes: [{ id: 'pi', label: 'Pi' }],
							edges: [],
						}),
					),
					new Promise<never>((_, reject) => {
						timeout = setTimeout(() => reject(new Error('Creation did not fail promptly')), 250)
						timeout.unref()
					}),
				]),
			).rejects.toThrow()
		} finally {
			if (timeout) clearTimeout(timeout)
		}
	})

	// @lat: [[tests#Room persistence#Restores generated boards]]
	it('persists a created diagram before returning and restores its records', async () => {
		const store = new RoomStore(directory, 60_000)
		stores.push(store)
		const result = await store.createBoard(
			parseDiagram({
				kind: 'flowchart-v1',
				title: 'Persistent diagram',
				nodes: [{ id: 'pi', label: 'Pi' }],
				edges: [],
			}),
		)
		const saved = JSON.parse(await readFile(join(directory, result.boardId), 'utf8'))
		expect(saved.documents.some((entry: any) => entry.state.id === shapeIdForNode('pi'))).toBe(true)
		expect(saved.documents.filter((entry: any) => entry.state.typeName === 'page')).toHaveLength(1)

		const original = await store.makeOrLoadRoom(result.boardId)
		original.close()
		await store.dispose()
		const restoredStore = new RoomStore(directory, 60_000)
		stores.push(restoredStore)
		const restored = await restoredStore.makeOrLoadRoom(result.boardId)
		expect(restored.getRecord(shapeIdForNode('pi'))).toMatchObject({ type: 'geo' })
	})
})
