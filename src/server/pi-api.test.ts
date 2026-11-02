import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readPiApiConfig } from './pi-api-config.js'
import { RoomStore } from './rooms.js'
import { buildServer } from './server.node.js'

const apiKey = 'development-only-token-with-at-least-32-bytes'
const diagram = {
	kind: 'flowchart-v1',
	title: 'Agent answer',
	nodes: [
		{ id: 'question', label: 'Question' },
		{ id: 'answer', label: 'Answer', color: 'green' },
	],
	edges: [{ from: 'question', to: 'answer', label: 'explains' }],
}

let app: FastifyInstance
let directory: string

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'tldraw-api-test-'))
	app = buildServer({
		piApi: { enabled: true, apiKey, publicBaseUrl: 'https://diagrams.example.test' },
		roomStore: new RoomStore(join(directory, 'rooms'), 60_000),
	})
})

afterEach(async () => {
	await app.close()
	await rm(directory, { recursive: true, force: true })
})

function createRequest(headers: Record<string, string> = {}) {
	return app.inject({ method: 'POST', url: '/api/pi/v1/boards', payload: diagram, headers })
}

describe('Pi board API', () => {
	// @lat: [[tests#Pi board API#Requires bearer authentication]]
	it('requires bearer authentication', async () => {
		const response = await createRequest()
		expect(response.statusCode).toBe(401)
		expect(response.json().error.code).toBe('unauthorized')
	})

	// @lat: [[tests#Pi board API#Rejects invalid HTTP diagrams]]
	it('rejects an invalid diagram without creating a room', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/api/pi/v1/boards',
			headers: { authorization: `Bearer ${apiKey}` },
			payload: { ...diagram, nodes: [] },
		})
		expect(response.statusCode).toBe(400)
		expect(response.json().error.code).toBe('invalid_diagram')
	})

	// @lat: [[tests#Pi board API#Returns persisted board URLs]]
	it('creates a persisted board and returns its editor URL and SDK version', async () => {
		const response = await createRequest({ authorization: `Bearer ${apiKey}` })
		expect(response.statusCode).toBe(201)
		const body = response.json()
		expect(body).toMatchObject({
			tldrawSdkVersion: '4.0.2',
			url: `https://diagrams.example.test/${body.boardId}`,
		})
		expect(body.boardId).toMatch(/^pi-[a-f0-9-]{36}$/)
		const roomStore = new RoomStore(join(directory, 'rooms'), 60_000)
		try {
			const room = await roomStore.makeOrLoadRoom(body.boardId)
			expect(room.getCurrentSnapshot().documents.length).toBeGreaterThan(3)
		} finally {
			await roomStore.dispose()
		}
	})

	// @lat: [[tests#Pi board API#Disabled by default]]
	it('keeps the control plane disabled by default', async () => {
		expect(readPiApiConfig({}).enabled).toBe(false)
		const disabled = buildServer({
			piApi: { enabled: false, publicBaseUrl: 'http://localhost:5858' },
			roomStore: new RoomStore(join(directory, 'disabled'), 60_000),
		})
		try {
			const response = await disabled.inject({ method: 'POST', url: '/api/pi/v1/boards', payload: diagram })
			expect(response.statusCode).toBe(503)
		} finally {
			await disabled.close()
		}
	})
})
