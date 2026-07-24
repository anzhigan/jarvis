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
  /** Forwarded onto the FloatingMenu's positioned wrapper element so it can be
   *  stacked/offset from CSS (the plugin leaves the wrapper at z-index:auto). */
  className?: string;
  children: ReactNode;
}

export function NoteFloatingMenu({ editor, shouldShow, options, className, children }: FloatingProps) {
  return (
    <FloatingMenu
      editor={editor}
      updateDelay={0}
      shouldShow={shouldShow}
      options={options}
      className={className}
    >
      {children}
    </FloatingMenu>
  );
}
