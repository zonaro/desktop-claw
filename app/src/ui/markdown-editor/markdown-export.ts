import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { invoke } from '../../lib/ipc-renderer'

/**
 * Converts markdown string to a full, standalone HTML document with basic
 * styling. The output is suitable for saving as a .html file or for printing
 * to PDF.
 */
export function exportMarkdownToHtml(
  markdown: string,
  title: string
): string {
  const rawHtml = marked(markdown, {
    gfm: true,
    breaks: true,
  }) as string

  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #24292e;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
    h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }
    h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; }
    code { padding: 0.2em 0.4em; margin: 0; font-size: 85%; background-color: rgba(27,31,35,0.05); border-radius: 3px; }
    pre { padding: 16px; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f6f8fa; border-radius: 6px; }
    pre code { padding: 0; background-color: transparent; }
    blockquote { padding: 0 1em; color: #6a737d; border-left: 0.25em solid #dfe2e5; }
    table { border-collapse: collapse; border-spacing: 0; width: 100%; margin: 16px 0; }
    table th, table td { padding: 6px 13px; border: 1px solid #dfe2e5; }
    table th { font-weight: 600; background-color: #f6f8fa; }
    table tr:nth-child(2n) { background-color: #f6f8fa; }
    img { max-width: 100%; }
    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }
    hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #e1e4e8; border: 0; }
  </style>
</head>
<body>
${cleanHtml}
</body>
</html>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Renders the given HTML string to a PDF file at the given path using the
 * Electron main process's webContents.printToPDF API.
 */
export async function exportMarkdownToPdf(
  html: string,
  outputPath: string
): Promise<void> {
  await invoke('export-markdown-pdf', { html, outputPath })
}
