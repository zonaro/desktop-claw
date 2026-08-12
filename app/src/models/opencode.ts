/**
 * Parameters for a single OpenCode CLI prompt execution. Instances are
 * constructed by the renderer and sent via IPC to the main-process runner.
 */
export interface IOpenCodeRunRequest {
  /** Opaque identifier used to correlate cancellation requests. */
  readonly requestId: string
  /** The OpenCode CLI binary name or path. */
  readonly command: string
  /** The model override to pass, or null to use OpenCode's default. */
  readonly model: string | null
  /** Maximum time (ms) the child process may run before being killed. */
  readonly timeoutMs: number
  /** The working directory for the child process. */
  readonly cwd: string
  /** The prompt text written to the child's stdin. */
  readonly prompt: string
}

/**
 * Result of probing whether an OpenCode CLI binary is installed and
 * what version it reports.
 */
export interface IOpenCodeAvailability {
  /** Whether the CLI executed successfully (exit code 0). */
  readonly available: boolean
  /** The trimmed first line of stdout when `available`, or null. */
  readonly version: string | null
}
