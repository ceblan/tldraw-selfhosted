import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TLPage } from '@tldraw/tlschema'
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

	// @lat: [[tests#Room persistence#Lists persisted boards]]
	it('lists existing snapshots with their page titles after a restart', async () => {
		const store = new RoomStore(directory, 60_000)
		stores.push(store)
		const first = await store.createBoard(
			parseDiagram({
				kind: 'flowchart-v1',
				title: 'Architecture',
				nodes: [{ id: 'api', label: 'API' }],
				edges: [],
			}),
		)
		const second = await store.createBoard(
			parseDiagram({
				kind: 'flowchart-v1',
				title: 'Mars mission',
				nodes: [{ id: 'launch', label: 'Launch' }],
				edges: [],
			}),
		)
		await writeFile(join(directory, 'broken-room'), '{not-json')
		await store.dispose()

		const restoredStore = new RoomStore(directory, 60_000)
		stores.push(restoredStore)
		const boards = await restoredStore.listBoards()
		expect(boards).toHaveLength(2)
		expect(boards).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ boardId: first.boardId, title: 'Architecture' }),
				expect.objectContaining({ boardId: second.boardId, title: 'Mars mission' }),
			]),
		)
		expect(boards.every((board) => !Number.isNaN(Date.parse(board.updatedAt)))).toBe(true)
		expect(boards.map((board) => board.updatedAt)).toEqual(
			[...boards.map((board) => board.updatedAt)].sort().reverse(),
		)
	})

	// @lat: [[tests#Room persistence#Deletes persisted boards]]
	it('closes a live room and deletes its durable snapshot exactly once', async () => {
		const store = new RoomStore(directory, 60_000)
		stores.push(store)
		const result = await store.createBoard(
			parseDiagram({
				kind: 'flowchart-v1',
				title: 'Disposable diagram',
				nodes: [{ id: 'pi', label: 'Pi' }],
				edges: [],
			}),
		)
		const room = await store.makeOrLoadRoom(result.boardId)
		expect(await store.deleteBoard(result.boardId)).toBe(true)
		expect(room.isClosed()).toBe(true)
		await expect(readFile(join(directory, result.boardId), 'utf8')).rejects.toMatchObject({
			code: 'ENOENT',
		})
		expect(await store.listBoards()).toEqual([])
		expect(await store.deleteBoard(result.boardId)).toBe(false)
	})

	// @lat: [[tests#Room persistence#Flushes live edits before listing]]
	it('flushes dirty browser rooms before building the index', async () => {
		const store = new RoomStore(directory, 60_000)
		stores.push(store)
		const room = await store.makeOrLoadRoom('browser-room')
		const page = room.getCurrentSnapshot().documents.find(
			(document) => document.state.typeName === 'page',
		)?.state as TLPage | undefined
		expect(page).toBeDefined()
		if (!page) throw new Error('Missing default page')

		await room.updateStore((records) => {
			records.put({ ...page, name: 'Edited in browser' })
		})
		const boards = await store.listBoards()
		expect(boards).toEqual([
			expect.objectContaining({ boardId: 'browser-room', title: 'Edited in browser' }),
		])
		expect(JSON.parse(await readFile(join(directory, 'browser-room'), 'utf8')).documents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ state: expect.objectContaining({ name: 'Edited in browser' }) }),
			]),
		)
	})
})
