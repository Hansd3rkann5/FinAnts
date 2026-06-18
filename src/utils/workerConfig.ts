// Shared worker-URL configuration used by every API client (transactions,
// cloud state sync, error log, EnableBanking, icon upload).
export interface WorkerConfig {
  workerUrl: string
}

const CONFIG_KEY = 'finants_worker_config'
const DEFAULT_WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? 'https://finants-proxy.simon-bader.workers.dev').replace(/\/$/, '')

export function loadWorkerConfig(): WorkerConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? (JSON.parse(raw) as WorkerConfig) : null
  } catch {
    return null
  }
}

export function saveWorkerConfig(cfg: WorkerConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

// The worker base URL — saved config if present, otherwise the built-in
// default. Use this everywhere instead of gating on loadWorkerConfig()
// (which is usually null).
export function resolveWorkerUrl(): string {
  return (loadWorkerConfig()?.workerUrl ?? DEFAULT_WORKER_URL).replace(/\/$/, '')
}
