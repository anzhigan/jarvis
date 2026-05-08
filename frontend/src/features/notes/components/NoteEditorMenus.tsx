import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';

/**
 * Thin wrappers around `@tiptap/react/menus` so the BubbleMenu / FloatingMenu
 * primitives — which transitively pull in floating-ui and the menus plugin —
 * land in their own chunk. NotesView only imports this module lazily, so the
 * library list view doesn't pay for menu code until a note is actually opened.
 */

interface BubbleProps {
  editor: Editor;
  shouldShow: (props: any) => boolean;
  options: any;
  className?: string;
  children: ReactNode;
}

export function NoteBubbleMenu({ editor, shouldShow, options, className, children }: BubbleProps) {
  return (
    <BubbleMenu
      editor={editor}
      className={className}
      updateDelay={0}
      shouldShow={shouldShow}
      options={options}
    >
      {children}
    </BubbleMenu>
  );
}

interface FloatingProps {
  editor: Editor;
  shouldShow: (props: any) => boolean;
  options: any;
  children: ReactNode;
}

export function NoteFloatingMenu({ editor, shouldShow, options, children }: FloatingProps) {
  return (
    <FloatingMenu
      editor={editor}
      updateDelay={0}
      shouldShow={shouldShow}
      options={options}
    >
      {children}
    </FloatingMenu>
  );
}
