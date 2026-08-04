/**
 * Optional per-instance overrides for provider construction.
 *
 * Primary use: the vision factory (`createVisionProvider`) builds a second
 * provider instance that is fully isolated from the text `CHAT_PROVIDER` —
 * separate model, optional separate API base (e.g. Kimi's vision endpoint
 * differs from its coding endpoint), and a shorter timeout for background
 * tagging workers.
 */
export interface ProviderOverrides {
  model?: string;
  apiBase?: string;
  requestTimeoutMs?: number;
}
