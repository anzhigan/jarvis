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
  const href = resolveUrl(url);
  const readonly = !editor?.isEditable;

  // While editing, the inner anchor must not steal the click — Tiptap needs
  // the click to select the node. Clicking the explicit download button
  // (or the whole card in read-only mode) opens the file in a new tab.
  const onCardClick = (e: React.MouseEvent) => {
    if (readonly) return; // anchor handles it
    e.preventDefault();
  };

  const onDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <NodeViewWrapper as="span" className="inline-block align-middle" data-drag-handle>
      <a
        href={href || '#'}
        target={readonly ? '_blank' : undefined}
        rel="noopener noreferrer"
        className="rt-file-attachment"
        data-active={selected ? 'true' : undefined}
        onClick={onCardClick}
        contentEditable={false}
      >
        <span className="rt-file-attachment__icon" data-kind={kind}>
          {kind === 'file' ? 'FILE' : kind.toUpperCase()}
        </span>
        <span className="rt-file-attachment__body">
          <span className="rt-file-attachment__name" title={filename}>{filename || 'Attachment'}</span>
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
      </a>
    </NodeViewWrapper>
  );
}

export const FileAttachment = Node.create({
  name: 'fileAttachment',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

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
