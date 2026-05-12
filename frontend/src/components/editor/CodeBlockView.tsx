import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Moon, Sun, Trash2 } from 'lucide-react';

const SUPPORTED_LANGS = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json', label: 'JSON' },
  { value: 'python', label: 'Python' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' },
];

const COLLAPSE_THRESHOLD_LINES = 15;

export default function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const language: string = node.attrs.language || 'plaintext';
  const theme: 'light' | 'dark' = node.attrs.theme === 'light' ? 'light' : 'dark';
  const text = node.textContent;
  const lineCount = text.length === 0 ? 1 : text.split('\n').length;
  const overflowed = lineCount > COLLAPSE_THRESHOLD_LINES;

  // Auto-expand short blocks. For long blocks, default to collapsed; the user
  // can toggle. Focus inside the block also auto-expands.
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const editing = editor.isEditable;
  const expanded = !overflowed || userExpanded === true;

  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  };

  const onLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateAttributes({ language: e.target.value });
  };

  const toggleTheme = () => {
    updateAttributes({ theme: theme === 'dark' ? 'light' : 'dark' });
  };

  // Selects the entire code block as a NodeSelection, then deletes it. We
  // use getPos to find the block's start position in the doc.
  const deleteBlock = () => {
    if (!editing) return;
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (typeof pos !== 'number') return;
    editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
  };

  return (
    <NodeViewWrapper
      className="cb-wrap"
      data-theme={theme}
      data-collapsed={overflowed && !expanded ? 'true' : undefined}
    >
      {/* contentEditable=false on header/footer so ProseMirror doesn't try to
          parse them as part of the code content. */}
      <div className="cb-head" contentEditable={false}>
        <select
          className="cb-lang"
          value={language}
          onChange={onLanguageChange}
          disabled={!editing}
          aria-label="Language"
        >
          {SUPPORTED_LANGS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <div className="cb-head-actions">
          <button
            type="button"
            className="cb-iconbtn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            aria-label="Toggle code block theme"
            disabled={!editing}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            type="button"
            className="cb-copy"
            onClick={copy}
            title={copied ? 'Copied' : 'Copy'}
            aria-label="Copy code"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            type="button"
            className="cb-iconbtn cb-iconbtn--danger"
            onClick={deleteBlock}
            title="Удалить блок"
            aria-label="Delete code block"
            disabled={!editing}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <pre className="cb-pre">
        {/* NodeViewContent's `as` is typed too narrowly in @tiptap/react —
            the runtime happily accepts any tag. ProseMirror's CodeBlock
            schema expects <code> as the contentDOM. */}
        <NodeViewContent as={'code' as 'div'} className={`hljs language-${language}`} />
      </pre>
      {overflowed && (
        <button
          type="button"
          className="cb-toggle"
          contentEditable={false}
          onClick={() => setUserExpanded((v) => !(v ?? false))}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          <span>
            {expanded
              ? 'Свернуть'
              : `Раскрыть · ${lineCount} строк`}
          </span>
        </button>
      )}
    </NodeViewWrapper>
  );
}
