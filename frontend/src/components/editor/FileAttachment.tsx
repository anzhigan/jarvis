/**
 * Tiptap node for inline file attachments (xlsx / docx / pdf / csv / …).
 *
 * Rendered as a clickable card with a colored type-badge, filename + size,
 * and a download button. Storage:
 *   <a class="rt-file-attachment" data-file-attachment href="…" data-filename="…" data-mime="…" data-size="…">
 * Persisting as a bare <a> means the attachment is still meaningful if the
 * editor is later swapped out — it degrades to a plain download link.
 *
 * The `href` stored in the saved HTML is the bare authenticated URL
 * (e.g. /api/attachments/notes/<id>/attachments/<uuid>.xlsx) without the
 * access-token query parameter. The token is injected at render time by the
 * API client's helpers — see `injectImageToken` / `stripImageToken`.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Download } from 'lucide-react';
import { resolveUrl } from '../../api/client';

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

function AttachmentView({ node, editor, selected }: any) {
  const { url, filename, mimeType, size } = node.attrs as {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  };
  const kind = fileKind(filename, mimeType);
  const readonly = !editor?.isEditable;

  // Compute the auth-bearing href on every click so the *current* access_token
  // is used (refreshes since render don't leave a stale token in the DOM).
  const buildHref = () => resolveUrl(url);

  const onCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const href = buildHref();
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  const onDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const href = buildHref();
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  // Render the card as a <span role="link"> instead of <a> because a real <a>
  // with an outdated href would let middle-click / right-click open a stale
  // tokenized URL. With <span>, every "open" goes through buildHref() which
  // reads the live access_token. We also avoid the (invalid) <button> inside <a>.
  return (
    <NodeViewWrapper as="span" className="inline-block align-middle" data-drag-handle>
      <span
        role={readonly ? 'link' : undefined}
        tabIndex={0}
        className="rt-file-attachment"
        data-active={selected ? 'true' : undefined}
        onClick={onCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(e as any); }
        }}
        title={filename}
        contentEditable={false}
      >
        <FileIcon kind={kind} />
        <span className="rt-file-attachment__body">
          <span className="rt-file-attachment__name">{filename || 'Attachment'}</span>
          <span className="rt-file-attachment__meta">{formatSize(size)}</span>
        </span>
        <button
          type="button"
          className="rt-file-attachment__download"
          onClick={onDownload}
          aria-label="Download"
          title="Download"
        >
          <Download size={15} />
        </button>
      </span>
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
  group: 'inline',
  inline: true,
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
