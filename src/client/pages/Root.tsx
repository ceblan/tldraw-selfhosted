import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { uniqueId } from 'tldraw'
import { filterBoards } from '../board-search'
import { setLocalStorageItem } from '../localStorage'

interface BoardSummary {
	boardId: string
	title: string
	updatedAt: string
}

const WORKER_URL =
	import.meta.env.MODE === 'production'
		? window.location.origin
		: (import.meta.env.VITE_WORKER_URL ?? 'http://localhost:5858')

export function Root() {
	const [boards, setBoards] = useState<BoardSummary[]>([])
	const [query, setQuery] = useState('')
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const searchRef = useRef<HTMLInputElement>(null)
	const filteredBoards = useMemo(() => filterBoards(boards, query), [boards, query])

	useEffect(() => {
		const controller = new AbortController()
		async function loadBoards() {
			try {
				const response = await fetch(`${WORKER_URL}/api/boards`, { signal: controller.signal })
				if (!response.ok) throw new Error(`Board index returned ${response.status}`)
				const body = (await response.json()) as { boards: BoardSummary[] }
				if (!Array.isArray(body.boards)) throw new Error('Invalid board index response')
				setBoards(body.boards)
			} catch (error) {
				if (!controller.signal.aborted) {
					console.error('Could not load board index', error)
					setError(true)
				}
			} finally {
				if (!controller.signal.aborted) setLoading(false)
			}
		}
		void loadBoards()
		return () => controller.abort()
	}, [])

	function createBlankBoard() {
		const roomId = 'test-room-' + uniqueId()
		setLocalStorageItem('my-local-room-id', roomId)
		window.location.assign(`/${roomId}`)
	}

	function clearSearch() {
		setQuery('')
		searchRef.current?.focus()
	}

	return (
		<main className="BoardIndex">
			<header className="BoardIndex-header">
				<div>
					<p className="BoardIndex-eyebrow">tldraw + Pi</p>
					<h1>Diagramas</h1>
					<p>Todos los tableros guardados en esta instancia.</p>
				</div>
				<button className="BoardIndex-new" onClick={createBlankBoard}>
					+ Nuevo tablero
				</button>
			</header>

			{loading && <p className="BoardIndex-status">Cargando diagramas…</p>}
			{error && (
				<div className="BoardIndex-status" role="alert">
					<p>No se pudo cargar el índice de diagramas.</p>
					<button onClick={() => window.location.reload()}>Reintentar</button>
				</div>
			)}
			{!loading && !error && boards.length === 0 && (
				<p className="BoardIndex-status">Todavía no hay diagramas guardados.</p>
			)}
			{!loading && !error && boards.length > 0 && (
				<section className="BoardIndex-search" aria-label="Buscar diagramas">
					<div className="BoardIndex-searchBox">
						<svg
							className="BoardIndex-searchIcon"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<circle cx="11" cy="11" r="7" />
							<path d="m20 20-4-4" />
						</svg>
						<input
							ref={searchRef}
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Buscar por título o ID…"
							aria-label="Buscar diagramas"
							autoComplete="off"
							spellCheck={false}
						/>
						{query && (
							<button className="BoardIndex-clear" onClick={clearSearch} aria-label="Limpiar búsqueda">
								×
							</button>
						)}
					</div>
					<p className="BoardIndex-results" role="status">
						{filteredBoards.length} de {boards.length} diagramas
					</p>
				</section>
			)}
			{!loading && !error && boards.length > 0 && filteredBoards.length === 0 && (
				<div className="BoardIndex-status">
					<p>No hay diagramas que coincidan con “{query.trim()}”.</p>
					<button onClick={clearSearch}>Limpiar búsqueda</button>
				</div>
			)}
			{!loading && !error && filteredBoards.length > 0 && (
				<ul className="BoardIndex-list">
					{filteredBoards.map((board) => (
						<li key={board.boardId}>
							<Link className="BoardIndex-board" to={`/${board.boardId}`}>
								<span className="BoardIndex-title">{board.title}</span>
								<code className="BoardIndex-id">{board.boardId}</code>
								<time className="BoardIndex-date" dateTime={board.updatedAt}>
									Actualizado: {new Date(board.updatedAt).toLocaleString()}
								</time>
								<span className="BoardIndex-open" aria-hidden="true">
									Abrir →
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</main>
	)
}
