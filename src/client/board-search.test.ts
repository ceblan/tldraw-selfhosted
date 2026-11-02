import { describe, expect, it } from 'vitest'
import { filterBoards } from './board-search.js'

const boards = [
	{ boardId: 'pi-c3f85b8d', title: 'grok-matrix: arquitectura y flujo de un mensaje' },
	{ boardId: 'pi-606a9cc7', title: 'Misión a Marte' },
	{ boardId: 'pi-4260e904', title: 'Arquitectura tldraw-docker + Pi' },
	{ boardId: 'pi-ae22af4f', title: 'Pi SDK development smoke' },
]

describe('board search', () => {
	// @lat: [[tests#Board search#Normalizes titles and search terms]]
	it('normalizes case, accents, and multi-term queries', () => {
		expect(filterBoards(boards, 'MISION')).toEqual([boards[1]])
		expect(filterBoards(boards, 'matrix flujo')).toEqual([boards[0]])
		expect(filterBoards(boards, 'no existe')).toEqual([])
	})

	// @lat: [[tests#Board search#Matches fuzzy titles and IDs]]
	it('matches ordered subsequences in titles and identifiers', () => {
		expect(filterBoards(boards, 'gkmatrix')).toEqual([boards[0]])
		expect(filterBoards(boards, 'sdkdev')).toEqual([boards[3]])
		expect(filterBoards(boards, '606A9')).toEqual([boards[1]])
	})

	// @lat: [[tests#Board search#Ranks matches and preserves default order]]
	it('ranks earlier exact matches first and preserves recency order without a query', () => {
		expect(filterBoards(boards, 'arquitectura')).toEqual([boards[2], boards[0]])
		expect(filterBoards(boards, '')).toBe(boards)
		expect(filterBoards(boards, '   ')).toBe(boards)
	})
})
