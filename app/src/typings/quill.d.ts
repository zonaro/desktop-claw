/**
 * Minimal ambient type declarations for Quill 2.x (which does not ship
 * its own TypeScript definitions via a `types` field).
 */
declare module 'quill' {
  interface IQuillToolbarModule {
    container?: ReadonlyArray<unknown>
  }

  interface IQuillModules {
    toolbar?: ReadonlyArray<unknown> | IQuillToolbarModule | boolean
  }

  interface IQuillOptions {
    theme?: string
    placeholder?: string
    readOnly?: boolean
    modules?: IQuillModules
  }

  class Quill {
    public readonly clipboard: {
      dangerouslyPasteHTML(html: string): void
    }

    public readonly root: HTMLElement

    public constructor(container: HTMLElement | string, options?: IQuillOptions)

    public on(
      event: 'text-change',
      handler: (delta?: unknown, oldDelta?: unknown, source?: string) => void
    ): void

    /** Returns the current contents of the editor as semantic HTML. */
    public getSemanticHTML(): string

    /** Returns the current plain-text contents of the editor. */
    public getText(): string

    /** Releases the editor instance and its DOM tree. */
    public destroy(): void
  }

  export = Quill
}
