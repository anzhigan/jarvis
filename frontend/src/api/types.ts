export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  avatar_url: string | null;
}

export interface NoteImage {
  id: string;
  url: string;
  filename: string;
  size_bytes: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Note {
  id: string;
  name: string;
  content: string;
  order: number;
  pinned: boolean;
  way_id: string | null;
  topic_id: string | null;
  topic_inline_id: string | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  way_id: string;
  name: string;
  order: number;
  notes: Note[];
  inline_note: Note | null;
  created_at: string;
  updated_at: string;
}

export interface Way {
  id: string;
  name: string;
  order: number;
  topics: Topic[];
  notes: Note[];
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'todo' | 'background' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type TodoKind = 'boolean' | 'numeric';
export type TodoRecurrence = 'none' | 'daily' | 'weekly';

export interface TodoEntry {
  id: string;
  todo_id: string;
  date: string;       // YYYY-MM-DD
  value: number;
}

export interface Todo {
  id: string;
  task_id: string | null;
  user_id: string;
  parent_todo_id: string | null;
  title: string;
  kind: TodoKind;
  unit: string;
  target_value: number | null;
  recurrence: TodoRecurrence;
  due_date: string | null;
  color: string;
  entries: TodoEntry[];
  task_title: string | null;
  total_value: number;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  is_completed: boolean;
  order: number;
  todos: Todo[];
  tags: Tag[];
  progress: number;   // 0..100
  created_at: string;
  updated_at: string;
}
