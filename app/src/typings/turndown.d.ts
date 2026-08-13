/**
 * Minimal ambient type declarations for turndown (HTML → Markdown).
 */
declare module 'turndown' {
  interface ITurndownOptions {
    headingStyle?: 'atx' | 'setext'
    hr?: string
    br?: string
    bulletListMarker?: string
    codeBlockStyle?: 'fenced' | 'indented'
    fence?: string
    emDelimiter?: string
    strongDelimiter?: string
    linkStyle?: 'inlined' | 'referenced'
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut'
    preformattedCode?: boolean
  }

  class TurndownService {
    public constructor(options?: ITurndownOptions)

    /** Converts the given HTML (string or DOM node) to Markdown. */
    public turndown(input: string | unknown): string

    public keep(filter?: unknown): void

    public remove(filter?: unknown): void

    public addRule(name: string, rule: unknown): void
  }

  export = TurndownService
}
