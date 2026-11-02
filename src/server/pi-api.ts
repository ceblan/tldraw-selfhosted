import type { FastifyInstance } from 'fastify'
import { TLDRAW_SDK_VERSION, DiagramValidationError, parseDiagram } from './diagram.js'
import { authorizePiRequest, type PiApiConfig } from './pi-api-config.js'
import type { BoardCreationResult } from './rooms.js'

interface BoardService {
	createBoard(diagram: ReturnType<typeof parseDiagram>): Promise<BoardCreationResult>
}

/** A narrow, authenticated control plane; browser sync remains separate from this contract. */
// @lat: [[architecture#Pi board API]]
export function registerPiApi(app: FastifyInstance, config: PiApiConfig, service: BoardService) {
	return app.register(async (api) => {
		api.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 64 * 1024 }, (_req, body, done) => {
			try {
				done(null, JSON.parse(body as string))
			} catch {
				done(Object.assign(new Error('Request body must be valid JSON'), { statusCode: 400 }))
			}
		})
		api.post('/api/pi/v1/boards', async (request, reply) => {
			if (!authorizePiRequest(request, reply, config)) return
			try {
				const diagram = parseDiagram(request.body)
				const board = await service.createBoard(diagram)
				return reply.code(201).send({
					...board,
					url: `${config.publicBaseUrl}/${encodeURIComponent(board.boardId)}`,
					tldrawSdkVersion: TLDRAW_SDK_VERSION,
				})
			} catch (error) {
				if (error instanceof DiagramValidationError) {
					return reply.code(400).send({ error: { code: 'invalid_diagram', message: error.message } })
				}
				request.log.error(error)
				return reply.code(500).send({
					error: { code: 'board_creation_failed', message: 'Could not create the board' },
				})
			}
		})
	})
}
