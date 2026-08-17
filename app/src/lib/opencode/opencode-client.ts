import {
  IOpenCodeAgent,
  IOpenCodeEvent,
  IOpenCodeMessage,
  IOpenCodePermissionRequest,
  IOpenCodeServerStatus,
  IOpenCodeSession,
  OpenCodePermissionResponse,
} from '../../models/opencode-session'

/** Thrown when the OpenCode server answers with a non-2xx status. */
export class OpenCodeRequestError extends Error {
  /** The HTTP status code returned by the server. */
  public readonly status: number

  public constructor(status: number, message: string) {
    super(message)
    this.name = 'OpenCodeRequestError'
    this.status = status
  }
}

/**
 * A typed client for the local OpenCode HTTP server.
 *
 * Every call is scoped to a repository through the `directory` query parameter,
 * which is how a single server instance can serve all open repositories.
 */
export class OpenCodeClient {
  /**
   * Builds a client from a server status, or returns null when the server
   * isn't running.
   */
  public static fromStatus(
    status: IOpenCodeServerStatus | null
  ): OpenCodeClient | null {
    if (status === null || !status.running || status.baseUrl === null) {
      return null
    }

    return new OpenCodeClient(status.baseUrl, status.password)
  }

  private readonly baseUrl: string
  private readonly authorization: string | null

  public constructor(baseUrl: string, password: string | null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.authorization =
      password === null ? null : `Basic ${btoa(`opencode:${password}`)}`
  }

  /** Lists the root sessions belonging to the given repository. */
  public async listSessions(
    directory: string
  ): Promise<ReadonlyArray<IOpenCodeSession>> {
    const sessions = await this.request<ReadonlyArray<IOpenCodeSession>>(
      'GET',
      '/session',
      directory
    )

    // Subagent sessions are children of a root session; OpenCode renders them
    // inline with the tool call that spawned them rather than as conversations.
    return sessions.filter(s => s.parentID === undefined)
  }

  /** Creates a new empty session in the given repository. */
  public createSession(
    directory: string,
    title?: string
  ): Promise<IOpenCodeSession> {
    return this.request<IOpenCodeSession>(
      'POST',
      '/session',
      directory,
      title === undefined ? {} : { title }
    )
  }

  /** Permanently deletes a session and its messages. */
  public async deleteSession(
    directory: string,
    sessionID: string
  ): Promise<void> {
    await this.request(
      'DELETE',
      `/session/${encodeURIComponent(sessionID)}`,
      directory
    )
  }

  /** Loads the full message history of a session. */
  public getMessages(
    directory: string,
    sessionID: string
  ): Promise<ReadonlyArray<IOpenCodeMessage>> {
    return this.request<ReadonlyArray<IOpenCodeMessage>>(
      'GET',
      `/session/${encodeURIComponent(sessionID)}/message`,
      directory
    )
  }

  /**
   * Queues a prompt for the session. Returns as soon as the server accepts it;
   * the assistant's reply arrives through the event stream.
   */
  public async sendPrompt(
    directory: string,
    sessionID: string,
    text: string,
    agent?: string
  ): Promise<void> {
    await this.request(
      'POST',
      `/session/${encodeURIComponent(sessionID)}/prompt_async`,
      directory,
      {
        parts: [{ type: 'text', text }],
        ...(agent === undefined ? {} : { agent }),
      }
    )
  }

  /** Interrupts the run currently in progress in the session. */
  public async abortSession(
    directory: string,
    sessionID: string
  ): Promise<void> {
    await this.request(
      'POST',
      `/session/${encodeURIComponent(sessionID)}/abort`,
      directory,
      {}
    )
  }

  /** Lists the agents configured for the given repository. */
  public listAgents(directory: string): Promise<ReadonlyArray<IOpenCodeAgent>> {
    return this.request<ReadonlyArray<IOpenCodeAgent>>(
      'GET',
      '/agent',
      directory
    )
  }

  /** Lists the permission requests currently awaiting an answer. */
  public listPendingPermissions(
    directory: string
  ): Promise<ReadonlyArray<IOpenCodePermissionRequest>> {
    return this.request<ReadonlyArray<IOpenCodePermissionRequest>>(
      'GET',
      '/permission',
      directory
    )
  }

  /** Answers a permission request, unblocking (or aborting) the tool call. */
  public async respondToPermission(
    directory: string,
    sessionID: string,
    permissionID: string,
    response: OpenCodePermissionResponse
  ): Promise<void> {
    await this.request(
      'POST',
      `/session/${encodeURIComponent(
        sessionID
      )}/permissions/${encodeURIComponent(permissionID)}`,
      directory,
      { response }
    )
  }

  /**
   * Subscribes to the server's event stream for the given repository.
   *
   * The stream is consumed with `fetch` rather than `EventSource` because the
   * server requires an `Authorization` header, which `EventSource` can't send.
   *
   * @returns A function that closes the stream.
   */
  public subscribeToEvents(
    directory: string,
    onEvent: (event: IOpenCodeEvent) => void,
    onError?: (error: Error) => void
  ): () => void {
    const controller = new AbortController()

    this.readEventStream(directory, onEvent, controller.signal).catch(
      (e: Error) => {
        if (!controller.signal.aborted) {
          onError?.(e)
        }
      }
    )

    return () => controller.abort()
  }

  /** Reads and dispatches server-sent events until the stream is aborted. */
  private async readEventStream(
    directory: string,
    onEvent: (event: IOpenCodeEvent) => void,
    signal: AbortSignal
  ): Promise<void> {
    const response = await fetch(this.url('/event', directory), {
      headers: this.headers(),
      signal,
    })

    if (!response.ok) {
      throw new OpenCodeRequestError(
        response.status,
        `The OpenCode event stream failed with status ${response.status}`
      )
    }

    if (response.body === null) {
      throw new Error('The OpenCode event stream returned an empty body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (!signal.aborted) {
      const { done, value } = await reader.read()

      if (done) {
        return
      }

      buffer += decoder.decode(value, { stream: true })

      // Events are separated by a blank line; anything after the last one is
      // a partial event and stays in the buffer.
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        const event = parseEventFrame(frame)

        if (event !== null) {
          onEvent(event)
        }
      }
    }
  }

  /** Performs a JSON request against the server. */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    directory: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(this.url(path, directory), {
      method,
      headers: {
        ...this.headers(),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

    if (!response.ok) {
      throw new OpenCodeRequestError(
        response.status,
        `OpenCode request ${method} ${path} failed with status ${response.status}`
      )
    }

    const text = await response.text()

    // 204 No Content (prompt_async) and empty bodies decode to undefined.
    return text.length === 0 ? (undefined as T) : (JSON.parse(text) as T)
  }

  /** Builds an absolute URL scoped to the given repository directory. */
  private url(path: string, directory: string): string {
    return `${this.baseUrl}${path}?directory=${encodeURIComponent(directory)}`
  }

  /** The headers sent with every request, including basic auth. */
  private headers(): Record<string, string> {
    return this.authorization === null
      ? {}
      : { Authorization: this.authorization }
  }
}

/**
 * Parses a single `text/event-stream` frame into an OpenCode event, or returns
 * null for comments, heartbeats and unparseable payloads.
 */
export function parseEventFrame(frame: string): IOpenCodeEvent | null {
  const data = frame
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim())
    .join('\n')

  if (data.length === 0) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(data)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).type !== 'string'
    ) {
      return null
    }

    const record = parsed as Record<string, unknown>
    const properties = record.properties

    return {
      type: record.type as string,
      properties:
        typeof properties === 'object' && properties !== null
          ? (properties as Record<string, unknown>)
          : {},
    }
  } catch {
    return null
  }
}
