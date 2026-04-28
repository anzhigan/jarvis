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

// Goal statuses (legacy names todo/in_progress/background still accepted by backend
// but normalized; on the frontend we always use the new names).
export type TaskStatus = 'backlog' | 'active' | 'paused' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type GoKind = 'boolean' | 'numeric';
export type GoRecurrence = 'none' | 'daily' | 'weekly';

export interface GoEntry {
  id: string;
  go_id: string;
  date: string;       // YYYY-MM-DD
  value: number;
}

export interface Go {
  id: string;
  user_id: string;
  task_id: string | null;
  sprint_id: string | null;
  title: string;
  description: string;
  kind: GoKind;
  unit: string;
  target_value: number | null;
  recurrence: GoRecurrence;
  due_date: string | null;
  color: string;
  entries: GoEntry[];
  task_title: string | null;
  sprint_title: string | null;
  total_value: number;
  is_done_today: boolean;
  created_at: string;
}

export interface Sprint {
  id: string;
  task_id: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  is_completed: boolean;
  color: string;
  gos: Go[];
  task_title: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
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
  sprints: Sprint[];
  gos: Go[];
  tags: Tag[];
  progress: number;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Routine — recurring activity (replaces old daily/weekly Go)
// ═══════════════════════════════════════════════════════════════════════════

export type RoutineScheduleType = 'daily' | 'weekly_on_days' | 'every_n_days' | 'times_per_week';

export interface RoutineEntry {
  id: string;
  routine_id: string;
  date: string;
  value: number;
}

export interface Routine {
  id: string;
  user_id: string;
  goal_id: string | null;
  step_id: string | null;
  title: string;
  description: string;
  color: string;
  schedule_type: RoutineScheduleType;
  schedule_days: string;        // CSV "0,2,4" for Mon/Wed/Fri (0=Sun..6=Sat)
  schedule_n_days: number;
  schedule_count_per_period: number;
  schedule_period: 'week' | 'month';
  start_date: string | null;
  end_date: string | null;
  is_paused: boolean;
  kind: 'boolean' | 'numeric';
  unit: string;
  target_value: number | null;
  entries: RoutineEntry[];
  created_at: string;
  updated_at: string;
}
