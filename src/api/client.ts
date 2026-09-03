import { API_BASE_URL } from '@/lib/config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * `fetch` JSON contre le backend, avec timeout et messages d'erreur exploitables
 * par l'UI (les écrans conservent le dernier état connu grâce à TanStack Query).
 */
export async function fetchJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(`Le backend a répondu ${response.status}`, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Le backend ne répond pas (délai dépassé)');
    }
    throw new ApiError('Impossible de joindre le backend');
  } finally {
    clearTimeout(timer);
  }
}
