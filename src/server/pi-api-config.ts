import { timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface PiApiConfig {
	enabled: boolean
	apiKey?: string
	publicBaseUrl: string
}

export function readPiApiConfig(env: NodeJS.ProcessEnv = process.env): PiApiConfig {
	const enabled = env.PI_API_ENABLED === 'true'
	const apiKey = env.PI_API_KEY
	if (enabled && (!apiKey || Buffer.byteLength(apiKey) < 32)) {
		throw new Error('PI_API_KEY must contain at least 32 bytes when PI_API_ENABLED=true')
	}
	const url = new URL(env.PUBLIC_BASE_URL ?? 'http://localhost:5858')
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new Error('PUBLIC_BASE_URL must be an HTTP(S) base URL without credentials, query, or fragment')
	}
	return { enabled, apiKey, publicBaseUrl: url.href.replace(/\/+$/, '') }
}

export function authorizePiRequest(request: FastifyRequest, reply: FastifyReply, config: PiApiConfig) {
	if (!config.enabled) {
		void reply.code(503).send({ error: { code: 'pi_api_disabled', message: 'Pi API is disabled' } })
		return false
	}
	const authorization = request.headers.authorization
	const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
	const expected = Buffer.from(config.apiKey!)
	const actual = Buffer.from(supplied)
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
		void reply
			.code(401)
			.header('WWW-Authenticate', 'Bearer')
			.send({ error: { code: 'unauthorized', message: 'A valid bearer token is required' } })
		return false
	}
	return true
}
