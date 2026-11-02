export interface BoardSearchItem {
	boardId: string
	title: string
}

function normalize(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
}

function fuzzyTermScore(term: string, target: string): number {
	const exactIndex = target.indexOf(term)
	if (exactIndex !== -1) {
		return 2_000 - exactIndex * 4 + (exactIndex === 0 ? 200 : 0) + term.length * 4
	}

	let termIndex = 0
	let previousMatch = -2
	let score = 100
	for (let targetIndex = 0; targetIndex < target.length && termIndex < term.length; targetIndex++) {
		if (target[targetIndex] !== term[termIndex]) continue
		score += previousMatch === targetIndex - 1 ? 18 : 8
		if (targetIndex === 0 || /[\s_+:.-]/.test(target[targetIndex - 1])) score += 8
		if (termIndex === 0) score -= Math.min(targetIndex, 50) * 0.25
		previousMatch = targetIndex
		termIndex++
	}

	return termIndex === term.length ? score - target.length * 0.05 : Number.NEGATIVE_INFINITY
}

function boardScore(board: BoardSearchItem, query: string): number {
	const terms = normalize(query).split(/\s+/).filter(Boolean)
	if (terms.length === 0) return 0
	const title = normalize(board.title)
	const boardId = normalize(board.boardId)
	let total = 0

	for (const term of terms) {
		const score = Math.max(fuzzyTermScore(term, title), fuzzyTermScore(term, boardId) * 0.6)
		if (score === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY
		total += score
	}
	return total
}

/** Filter on every keystroke, ranking exact matches ahead of ordered subsequences. */
// @lat: [[architecture#Board search]]
export function filterBoards<T extends BoardSearchItem>(boards: T[], query: string): T[] {
	if (!query.trim()) return boards
	return boards
		.map((board, index) => ({ board, index, score: boardScore(board, query) }))
		.filter((result) => result.score !== Number.NEGATIVE_INFINITY)
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((result) => result.board)
}
