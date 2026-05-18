/**
 * Tiptap node for block-level file attachments (xlsx / docx / pdf / csv / …).
 *
 * Rendered as a clickable card with a colored type-badge, filename + size,
 * and a download icon. Persisted as `<a class="rt-file-attachment"
 * data-file-attachment href="…" data-filename="…" data-mime="…" data-size="…">`
 * so the attachment degrades to a plain link if the editor is later removed.
 *
 * Auth:
 * The stored `href` is the bare authenticated URL (no `?token=` baked in) —
 * tokens go stale across refreshes, so we keep storage clean. At render time
 * the NodeView uses a real `<a>` element whose `href` is set to
 * `resolveUrl(url)` and refreshed on every interaction (mousedown / focus)
 * — that way left-click, middle-click, Cmd+click, "Copy link" and
 * "Save link as" all carry the current access_token automatically.
 */
import { useCallback, useEffect, useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Download } from 'lucide-react';
import { fetchAuthed, resolveUrl } from '../../api/client';

export const KNOWN_EXTENSIONS = new Set(['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv']);
export const FILE_ACCEPT =
  '.pdf,.xlsx,.xls,.docx,.doc,.csv,' +
  'application/pdf,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/msword,' +
  'text/csv';

export function fileKind(filename: string | null | undefined, mime?: string | null): string {
  const name = (filename || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  if (KNOWN_EXTENSIONS.has(ext)) return ext;
  if (mime) {
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('spreadsheetml') || mime.includes('ms-excel')) return 'xlsx';
    if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'docx';
    if (mime.includes('csv')) return 'csv';
  }
  return 'file';
}

function formatSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function AttachmentView({ node, selected }: any) {
  const { url, filename, mimeType, size } = node.attrs as {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  };
  const kind = fileKind(filename, mimeType);

  // We update the <a>'s href synchronously on the DOM (via ref) instead of
  // React state. Reason: mousedown → setState → click is racy — React's
  // re-render hasn't applied the new href by the time the click fires, so the
  // browser navigates using the stale (and possibly expired) tokenized URL
  // captured at mount time. Direct DOM writes sidestep the reconciler.
  const aRef = useRef<HTMLAnchorElement>(null);
  const refreshHref = useCallback(() => {
    if (aRef.current) aRef.current.href = resolveUrl(url);
  }, [url]);

  // Left-click → intercept and route through the auth wrapper (which
  // auto-refreshes on 401). Then open the bytes via a blob URL so the new
  // tab never relies on the URL token at all. Middle-click / Cmd+click skip
  // this handler and fall back to the direct href above (token-injected),
  // which is fine for plain right-after-load usage.
  const onClick = useCallback(async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    try {
      const res = await fetchAuthed(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      // Revoke shortly after handing the URL off — the new tab keeps its own
      // reference, and we don't want to leak memory.
      const w = window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), w ? 60_000 : 1_000);
    } catch {
      // Fall back to a plain navigation with a freshly-resolved token URL —
      // last-ditch attempt; browser will surface its own error if it fails.
      window.open(resolveUrl(url), '_blank', 'noopener,noreferrer');
    }
  }, [url]);

  // Set the initial href on mount and whenever url changes.
  useEffect(() => { refreshHref(); }, [refreshHref]);

  return (
    <NodeViewWrapper className="rt-file-attachment-wrap" data-drag-handle>
      <a
        ref={aRef}
        href={resolveUrl(url)}
        target="_blank"
        rel="noopener noreferrer"
        className="rt-file-attachment"
        data-active={selected ? 'true' : undefined}
        onClick={onClick}
        onMouseDown={refreshHref}
        onMouseEnter={refreshHref}
        onFocus={refreshHref}
        onTouchStart={refreshHref}
        title={filename}
        contentEditable={false}
      >
        <FileIcon kind={kind} />
        <span className="rt-file-attachment__body">
          <span className="rt-file-attachment__name">{filename || 'Attachment'}</span>
          <span className="rt-file-attachment__meta">{formatSize(size)}</span>
        </span>
        <span
          className="rt-file-attachment__download"
          aria-label="Download"
          title="Download"
        >
          <Download size={15} />
        </span>
      </a>
    </NodeViewWrapper>
  );
}

/**
 * Document-shaped file icon — a page silhouette with a folded top-right corner
 * and the file-type label, mirroring how macOS / Windows render document files.
 */
function FileIcon({ kind }: { kind: string }) {
  const label = kind === 'file' ? '' : kind.toUpperCase();
  return (
    <span className="rt-file-attachment__icon" data-kind={kind} aria-hidden="true">
      <svg viewBox="0 0 32 36" width="28" height="32" focusable="false">
        {/* Page body */}
        <path
          className="rt-file-attachment__icon-bg"
          d="M3 2 H21 L29 10 V32 A2 2 0 0 1 27 34 H3 A2 2 0 0 1 1 32 V4 A2 2 0 0 1 3 2 Z"
        />
        {/* Folded corner */}
        <path
          className="rt-file-attachment__icon-fold"
          d="M21 2 V8 A2 2 0 0 0 23 10 H29 Z"
        />
        {/* Label tag */}
        {label && (
          <g>
            <rect
              className="rt-file-attachment__icon-tag"
              x="2" y="20" width="22" height="10" rx="1.5"
            />
            <text
              className="rt-file-attachment__icon-text"
              x="13" y="27.6"
              textAnchor="middle"
              fontSize="7"
              fontWeight="700"
              letterSpacing="0.3"
            >{label}</text>
          </g>
        )}
      </svg>
    </span>
  );
}

export const FileAttachment = Node.create({
  name: 'fileAttachment',
  // Block-level: an attachment is a standalone unit, not a word inside a
  // paragraph. Critical UX: when the user is inside a numbered or bulleted
  // list and inserts a file, the list's marker should NOT pollute the file
  // card. Block placement also matches Notion / Linear / Confluence.
  group: 'block',
  atom: true,
  draggable: true,
  // selectable: false → arrow keys skip the card in one step instead of first
  // selecting it as a node. The download button inside still receives clicks.
  selectable: false,

  addAttributes() {
    return {
      url:      { default: '' },
      filename: { default: '' },
      mimeType: { default: 'application/octet-stream' },
      size:     { default: 0 },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-file-attachment]',
        getAttrs: (el) => {
          const a = el as HTMLAnchorElement;
          return {
            url:      a.getAttribute('href') || '',
            filename: a.getAttribute('data-filename') || '',
            mimeType: a.getAttribute('data-mime') || 'application/octet-stream',
            size:     parseInt(a.getAttribute('data-size') || '0', 10) || 0,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    // Persist as a plain <a> with data-* attrs — degrades to a normal download
    // link if rendered outside the editor (e.g. public share preview).
    const { url, filename, mimeType, size } = node.attrs as {
      url: string; filename: string; mimeType: string; size: number;
    };
    const kind = fileKind(filename, mimeType);
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        href: url,
        'data-file-attachment': 'true',
        'data-filename': filename,
        'data-mime':     mimeType,
        'data-size':     String(size),
        target: '_blank',
        rel:    'noopener noreferrer',
        class:  'rt-file-attachment',
      }),
      ['span', { class: 'rt-file-attachment__icon', 'data-kind': kind }, (kind === 'file' ? 'FILE' : kind.toUpperCase())],
      ['span', { class: 'rt-file-attachment__body' },
        ['span', { class: 'rt-file-attachment__name' }, filename || 'Attachment'],
        ['span', { class: 'rt-file-attachment__meta' }, formatSize(size)],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentView);
  },

  addCommands() {
    return {
      insertFileAttachment:
        (attrs: { url: string; filename: string; mimeType: string; size: number }) =>
        ({ chain }: any) =>
          chain().insertContent({ type: 'fileAttachment', attrs }).run(),
    } as any;
  },
});
