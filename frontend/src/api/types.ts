export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
}

export interface NoteImage {
  id: string;
  url: string;
  filename: string;
  size_bytes: number;
}

export interface Note {
  id: string;
  name: string;
  content: string;
  order: number;
  way_id: string | null;
  topic_id: string | null;
  topic_inline_id: string | null;
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

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  is_completed: boolean;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface MetricEntry {
  id: string;
  metric_id: string;
  value: number;
  date: string;
  note: string;
  created_at: string;
}

export interface Metric {
  id: string;
  name: string;
  description: string;
  unit: string;
  target_value: number | null;
  color: string;
  entries: MetricEntry[];
  created_at: string;
}
