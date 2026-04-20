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
  note: Note | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type PracticeKind = 'boolean' | 'numeric';
export type PracticeStatus = 'active' | 'paused' | 'done';

export interface PracticeEntry {
  id: string;
  practice_id: string;
  date: string;       // YYYY-MM-DD
  value: number;
  note: string;
  created_at: string;
}

export interface Practice {
  id: string;
  task_id: string;
  title: string;
  kind: PracticeKind;
  unit: string;
  target_value: number | null;
  duration_days: number | null;
  color: string;
  status: PracticeStatus;
  entries: PracticeEntry[];
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  is_completed: boolean;
  order: number;
  practices: Practice[];
  tags: Tag[];
  created_at: string;
  updated_at: string;
}
