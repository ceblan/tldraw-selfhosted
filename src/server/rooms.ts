import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { RoomSnapshot, TLSocketRoom } from '@tldraw/sync-core'
import type { TLRecord } from '@tldraw/tlschema'
import { diagramToRecords } from './diagram-records.js'
import type { FlowchartDiagram } from './diagram.js'

const ROOM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

interface RoomState {
	room: TLSocketRoom<TLRecord, void>
	id: string
	dirty: boolean
	saving: Promise<void>
	saveError?: unknown
}

export interface BoardCreationResult {
	boardId: string
	snapshotVersion: number
}

export interface BoardSummary {
	boardId: string
	title: string
	updatedAt: string
}

export class RoomStore {
	private readonly rooms = new Map<string, RoomState>()
	private mutex: Promise<unknown> = Promise.resolve()
	private readonly timer: NodeJS.Timeout

	constructor(
		private readonly directory: string,
		saveIntervalMs = 2_000,
	) {
		this.timer = setInterval(() => this.persistDirtyRooms(), saveIntervalMs)
		this.timer.unref()
	}

	private exclusive<T>(work: () => Promise<T>): Promise<T> {
		const result = this.mutex.then(work)
		this.mutex = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}

	private async readSnapshotIfExists(roomId: string): Promise<RoomSnapshot | undefined> {
		try {
			return JSON.parse(await readFile(join(this.directory, roomId), 'utf8')) as RoomSnapshot
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
			throw error
		}
	}

	private loadRoom(roomId: string, initialSnapshot?: RoomSnapshot) {
		const state = {} as RoomState
		state.id = roomId
		state.dirty = false
		state.saving = Promise.resolve()
		state.room = new TLSocketRoom<TLRecord>({
			initialSnapshot,
			onSessionRemoved: (room, args) => {
				console.log('client disconnected', args.sessionId, roomId)
				if (args.numSessionsRemaining === 0) {
					room.close()
				}
			},
			onDataChange: () => {
				state.dirty = true
			},
		})
		return state
	}

	/** List durable rooms without loading them into memory or creating missing rooms. */
	// @lat: [[architecture#Board registry]]
	async listBoards(): Promise<BoardSummary[]> {
		// Include recent browser edits without waiting for the periodic save.
		await Promise.all(
			[...this.rooms.values()]
				.filter((state) => state.dirty)
				.map((state) =>
					this.flushRoom(state.id).catch((error) => {
						console.warn(`Could not flush room ${state.id} before indexing`, error)
					}),
				),
		)

		let entries
		try {
			entries = await readdir(this.directory, { withFileTypes: true })
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
			throw error
		}

		const boards = await Promise.all(
			entries
				.filter((entry) => entry.isFile() && ROOM_ID_PATTERN.test(entry.name))
				.map(async (entry): Promise<BoardSummary | undefined> => {
					const path = join(this.directory, entry.name)
					try {
						const snapshot = JSON.parse(await readFile(path, 'utf8')) as RoomSnapshot
						const metadata = await stat(path)
						const page = snapshot.documents?.find((document) => document.state.typeName === 'page')
						const pageName =
							page && 'name' in page.state && typeof page.state.name === 'string'
								? page.state.name.trim()
								: ''
						return {
							boardId: entry.name,
							title: pageName || entry.name,
							updatedAt: metadata.mtime.toISOString(),
						}
					} catch (error) {
						console.warn(`Could not index room ${entry.name}`, error)
						return undefined
					}
				}),
		)

		return boards
			.filter((board): board is BoardSummary => board !== undefined)
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.boardId.localeCompare(b.boardId))
	}

	makeOrLoadRoom(roomId: string): Promise<TLSocketRoom<TLRecord, void>> {
		if (!ROOM_ID_PATTERN.test(roomId)) throw new Error('Invalid room id')
		return this.exclusive(async () => {
			const existing = this.rooms.get(roomId)
			if (existing && !existing.room.isClosed()) return existing.room
			const state = this.loadRoom(roomId, await this.readSnapshotIfExists(roomId))
			this.rooms.set(roomId, state)
			return state.room
		})
	}

	private persist(state: RoomState): Promise<void> {
		state.dirty = true
		state.saving = state.saving.then(async () => {
			while (state.dirty) {
				state.dirty = false
				state.saveError = undefined
				const snapshot = state.room.getCurrentSnapshot()
				const path = join(this.directory, state.id)
				const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
				try {
					await mkdir(this.directory, { recursive: true })
					await writeFile(temporary, JSON.stringify(snapshot), { flag: 'wx' })
					await rename(temporary, path)
				} catch (error) {
					state.dirty = true
					state.saveError = error
					await rm(temporary, { force: true })
					console.error(`Could not persist room ${state.id}`, error)
					// A later timer/flush may retry; never spin synchronously on a
					// full, read-only, or unavailable filesystem.
					break
				}
			}
		})
		return state.saving
	}

	async flushRoom(roomId: string): Promise<void> {
		const state = this.rooms.get(roomId)
		if (!state) return
		await this.persist(state)
		if (state.saveError) throw state.saveError
	}

	private async replaceGeneratedContent(state: RoomState, diagram: FlowchartDiagram) {
		await state.room.updateStore((store) => {
			for (const record of store.getAll()) {
				if (['page', 'shape', 'binding'].includes(record.typeName)) store.delete(record)
			}
			for (const record of diagramToRecords(diagram)) store.put(record)
		})
		await this.flushRoom(state.id)
	}

	/** Create through the live room abstraction and persist before advertising its URL. */
	// @lat: [[architecture#Room persistence]]
	createBoard(diagram: FlowchartDiagram): Promise<BoardCreationResult> {
		return this.exclusive(async () => {
			const boardId = `pi-${randomUUID()}`
			const state = this.loadRoom(boardId)
			this.rooms.set(boardId, state)
			try {
				await this.replaceGeneratedContent(state, diagram)
			} catch (error) {
				state.room.close()
				this.rooms.delete(boardId)
				throw error
			}
			return { boardId, snapshotVersion: state.room.getCurrentDocumentClock() }
		})
	}

	/** Replace a generated board in place so visual revisions do not create duplicate rooms. */
	// @lat: [[architecture#Visual revision workflow]]
	async updateBoard(boardId: string, diagram: FlowchartDiagram): Promise<BoardCreationResult | undefined> {
		if (!/^pi-[a-zA-Z0-9_-]+$/.test(boardId)) return undefined
		return this.exclusive(async () => {
			let state = this.rooms.get(boardId)
			if (!state || state.room.isClosed()) {
				const snapshot = await this.readSnapshotIfExists(boardId)
				if (!snapshot) return undefined
				state = this.loadRoom(boardId, snapshot)
				this.rooms.set(boardId, state)
			}
			await this.replaceGeneratedContent(state, diagram)
			return { boardId, snapshotVersion: state.room.getCurrentDocumentClock() }
		})
	}

	/** Delete durable content without allowing an in-flight save to recreate the file. */
	// @lat: [[architecture#Board deletion]]
	async deleteBoard(boardId: string): Promise<boolean> {
		if (!ROOM_ID_PATTERN.test(boardId)) return false
		return this.exclusive(async () => {
			const state = this.rooms.get(boardId)
			if (state) {
				this.rooms.delete(boardId)
				state.room.close()
				await state.saving
			}
			try {
				await rm(join(this.directory, boardId))
				return true
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') return state !== undefined
				throw error
			}
		})
	}

	private persistDirtyRooms() {
		for (const [roomId, state] of this.rooms) {
			if (state.dirty) void this.flushRoom(roomId).catch(() => {})
			if (state.room.isClosed() && !state.dirty) this.rooms.delete(roomId)
		}
	}

	async dispose() {
		clearInterval(this.timer)
		await Promise.all([...this.rooms.keys()].map((roomId) => this.flushRoom(roomId)))
		for (const state of this.rooms.values()) state.room.close()
		this.rooms.clear()
	}
}
