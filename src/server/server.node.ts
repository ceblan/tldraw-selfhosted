import cors from '@fastify/cors'
import ServeStatic from '@fastify/static'
import websocketPlugin from '@fastify/websocket'
import fastify from 'fastify'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { RawData } from 'ws'
import { loadAsset, storeAsset } from './assets.js'
import { readPiApiConfig, type PiApiConfig } from './pi-api-config.js'
import { registerPiApi } from './pi-api.js'
import { RoomStore } from './rooms.js'
import { unfurl } from './unfurl.js'

export interface ServerOptions {
	piApi?: PiApiConfig
	roomStore?: RoomStore
}

export function buildServer(options: ServerOptions = {}) {
	const app = fastify()
	const piApi = options.piApi ?? readPiApiConfig()
	const roomStore =
		options.roomStore ??
		new RoomStore(process.env.CONFIG_DIR ? path.join(process.env.CONFIG_DIR, 'rooms') : path.resolve('.rooms'))

	app.register(websocketPlugin)
	app.register(cors, {
		origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
	})
	app.addHook('onClose', async () => {
		await roomStore.dispose()
	})

	if (process.env.NODE_ENV === 'production') {
		app.register(ServeStatic, {
			root: path.resolve(import.meta.dirname, '..', '..', 'client', 'assets'),
			prefix: '/assets/',
		})
	}

	registerPiApi(app, piApi, roomStore)

	app.register(async (app) => {
		// This is the browser collaboration plane, not the authenticated Pi control plane.
		app.get('/api/boards', async (req, res) => {
			try {
				return { boards: await roomStore.listBoards() }
			} catch (error) {
				req.log.error(error)
				return res.code(500).send({
					error: { code: 'board_index_failed', message: 'Could not list boards' },
				})
			}
		})

		app.get('/api/connect/:roomId', { websocket: true }, async (socket, req) => {
			const roomId = (req.params as { roomId: string }).roomId
			if (!/^[a-zA-Z0-9_-]{1,128}$/.test(roomId)) {
				socket.close(1008, 'Invalid room id')
				return
			}
			const sessionId = (req.query as { sessionId?: string }).sessionId
			if (!sessionId) {
				socket.close(1008, 'Missing session id')
				return
			}

			// Buffer messages until the asynchronous room load has completed.
			const caughtMessages: RawData[] = []
			const collectMessagesListener = (message: RawData) => caughtMessages.push(message)
			socket.on('message', collectMessagesListener)
			try {
				const room = await roomStore.makeOrLoadRoom(roomId)
				room.handleSocketConnect({ sessionId, socket })
				socket.off('message', collectMessagesListener)
				for (const message of caughtMessages) socket.emit('message', message)
			} catch (error) {
				req.log.error(error)
				socket.close(1011, 'Could not load room')
			}
		})

		app.addContentTypeParser('*', (_, __, done) => done(null))
		app.put('/api/uploads/:id', async (req, res) => {
			const id = (req.params as { id: string }).id
			await storeAsset(id, req.raw)
			res.send({ ok: true })
		})
		app.get('/api/uploads/:id', async (req, res) => {
			const id = (req.params as { id: string }).id
			const data = await loadAsset(id)
			res.send(data)
		})
		app.get('/api/unfurl', async (req, res) => {
			const url = (req.query as { url: string }).url
			res.send(await unfurl(url))
		})

		if (process.env.NODE_ENV === 'production') {
			app.setNotFoundHandler((_req, res) => {
				res.sendFile('index.html', path.resolve(import.meta.dirname, '..', '..', 'client'))
			})
		}
	})

	return app
}

export async function startServer() {
	const app = buildServer()
	const port = Number(process.env.PORT ?? 5858)
	await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' })
	console.log(`Server started on port ${port}`)
	return app
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
	try {
		await startServer()
	} catch (error) {
		console.error(error)
		process.exitCode = 1
	}
}
