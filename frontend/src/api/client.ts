import type {
  Note,
  NoteImage,
  Tag,
  Task,
  TaskPriority,
  TaskStatus,
  Go,
  GoEntry,
  GoKind,
  GoRecurrence,
  Sprint,
  User,
  Way,
} from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const refresh_token = localStorage.getItem('refresh_token');
  if (!refresh_token) return false;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (!(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry) {
    const ok = await tryRefresh();
    if (ok) return request<T>(path, init, false);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? 'Unknown error');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, username: string, password: string) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) }),
  login: async (email: string, password: string) => {
    const data = await request<{ access_token: string; refresh_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  },
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
  me: () => request<User>('/auth/me'),
  updateProfile: (data: { username?: string; email?: string }) =>
    request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
  deleteAccount: () => request<void>('/auth/me', { method: 'DELETE' }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<User>('/auth/me/avatar', { method: 'POST', body: form });
  },
  deleteAvatar: () => request<User>('/auth/me/avatar', { method: 'DELETE' }),
};

// ── Ways / Topics / Notes (unchanged) ─────────────────────────────────────────
export const waysApi = {
  list: () => request<Way[]>('/ways'),
  create: (name: string, order = 0) =>
    request<Way>('/ways', { method: 'POST', body: JSON.stringify({ name, order }) }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request<Way>(`/ways/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/ways/${id}`, { method: 'DELETE' }),
};

export const topicsApi = {
  create: (wayId: string, name: string, order = 0) =>
    request<any>(`/ways/${wayId}/topics`, { method: 'POST', body: JSON.stringify({ name, order }) }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request<any>(`/topics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/topics/${id}`, { method: 'DELETE' }),
};

export const notesApi = {
  create: (data: { name: string; content?: string; way_id?: string; topic_id?: string; topic_inline_id?: string }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; content?: string; pinned?: boolean }) =>
    request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  move: (id: string, target: { way_id?: string; topic_id?: string }) =>
    request<Note>(`/notes/${id}/move`, { method: 'POST', body: JSON.stringify(target) }),
  delete: (id: string) => request<void>(`/notes/${id}`, { method: 'DELETE' }),
  uploadImage: (noteId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<NoteImage>(`/notes/${noteId}/images`, { method: 'POST', body: form });
  },
  attachTag: (noteId: string, tagId: string) =>
    request<void>(`/notes/${noteId}/tags/${tagId}`, { method: 'POST' }),
  detachTag: (noteId: string, tagId: string) =>
    request<void>(`/notes/${noteId}/tags/${tagId}`, { method: 'DELETE' }),
};

// ── Tags ──────────────────────────────────────────────────────────────────────
export const tagsApi = {
  list: () => request<Tag[]>('/tags'),
  create: (name: string, color: string) =>
    request<Tag>('/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<Tag>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
};

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (status?: TaskStatus) =>
    request<Task[]>(`/tasks${status ? `?status_filter=${status}` : ''}`),
  create: (data: { title: string; description?: string; status?: TaskStatus; priority?: TaskPriority; start_date?: string | null; due_date?: string | null }) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority; start_date?: string | null; due_date?: string | null; is_completed?: boolean; order?: number }) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  attachTag: (taskId: string, tagId: string) =>
    request<void>(`/tasks/${taskId}/tags/${tagId}`, { method: 'POST' }),
  detachTag: (taskId: string, tagId: string) =>
    request<void>(`/tasks/${taskId}/tags/${tagId}`, { method: 'DELETE' }),
};

// ── Todos ─────────────────────────────────────────────────────────────────────
export const gosApi = {
  list: () => request<Go[]>('/gos'),

  create: (data: {
    title: string;
    kind?: GoKind;
    unit?: string;
    target_value?: number | null;
    recurrence?: GoRecurrence;
    due_date?: string | null;
    color?: string;
    task_id?: string | null;
    sprint_id?: string | null;
  }) => request<Go>('/gos', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: {
    title?: string;
    kind?: GoKind;
    unit?: string;
    target_value?: number | null;
    recurrence?: GoRecurrence;
    due_date?: string | null;
    color?: string;
    task_id?: string | null;
    sprint_id?: string | null;
  }) => request<Go>(`/gos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/gos/${id}`, { method: 'DELETE' }),

  upsertEntry: (goId: string, date: string, value: number) =>
    request<GoEntry>(`/gos/${goId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ date, value }),
    }),

  agenda: (section: 'today' | 'future' | 'past', daysBack = 30) =>
    request<Go[]>(`/gos/agenda?section=${section}&days_back=${daysBack}`),
};

export const sprintsApi = {
  create: (data: {
    task_id: string;
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    color?: string;
  }) => request<Sprint>('/sprints', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: {
    title?: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    is_completed?: boolean;
    color?: string;
  }) => request<Sprint>(`/sprints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/sprints/${id}`, { method: 'DELETE' }),

  attachGo: (sprintId: string, goId: string) =>
    request<Go>(`/sprints/${sprintId}/attach/${goId}`, { method: 'POST' }),

  detachGo: (sprintId: string, goId: string) =>
    request<Go>(`/sprints/${sprintId}/detach/${goId}`, { method: 'POST' }),

  agenda: (section: 'current' | 'future' | 'past', daysBack = 90) =>
    request<Sprint[]>(`/sprints/agenda?section=${section}&days_back=${daysBack}`),
};

// ── AI ─────────────────────────────────────────────────────────────────────
export interface AIQuizQuestion {
  id: string;
  type: 'multiple_choice' | 'open';
  question: string;
  options?: string[];
  correct_index?: number;
  correct_answer?: string;
  explanation: string;
}

export interface AIQuiz {
  quiz_id: string;
  questions: AIQuizQuestion[];
  note_titles: string[];
}

export interface AIStatus {
  configured: boolean;
  model: string;
  provider: string;
}

export const aiApi = {
  status: () => request<AIStatus>('/ai/status'),

  quiz: (data: {
    note_ids: string[];
    num_questions?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    language?: 'en' | 'ru';
  }) => request<AIQuiz>('/ai/quiz', { method: 'POST', body: JSON.stringify(data) }),

  chat: (data: {
    note_ids: string[];
    history: { role: 'user' | 'assistant' | 'system'; content: string }[];
    message: string;
    language?: 'en' | 'ru';
  }) => request<{ reply: string }>('/ai/chat', { method: 'POST', body: JSON.stringify(data) }),

  grade: (data: {
    question: string;
    expected_answer: string;
    user_answer: string;
    language?: 'en' | 'ru';
  }) => request<{ correct: boolean; score: number; feedback: string }>('/ai/grade', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
};


// ═══════════════════════════════════════════════════════════════════════════
// Routines API
// ═══════════════════════════════════════════════════════════════════════════
import type { Routine, RoutineEntry } from './types';

export const routinesApi = {
  list: () => request<Routine[]>('/routines'),

  byGoal: (goalId: string) => request<Routine[]>(`/routines/by-goal/${goalId}`),

  dueToday: () => request<Routine[]>('/routines/agenda/today'),

  create: (data: {
    title: string;
    description?: string;
    color?: string;
    goal_id?: string | null;
    step_id?: string | null;
    schedule_type?: 'daily' | 'weekly_on_days' | 'every_n_days' | 'times_per_week';
    schedule_days?: string;
    schedule_n_days?: number;
    schedule_count_per_period?: number;
    schedule_period?: 'week' | 'month';
    start_date?: string | null;
    end_date?: string | null;
    kind?: 'boolean' | 'numeric';
    unit?: string;
    target_value?: number | null;
  }) => request<Routine>('/routines', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<Routine>) =>
    request<Routine>(`/routines/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/routines/${id}`, { method: 'DELETE' }),

  upsertEntry: (id: string, date: string, value: number) =>
    request<RoutineEntry>(`/routines/${id}/entries`, {
      method: 'POST',
      body: JSON.stringify({ date, value }),
    }),

  deleteEntry: (id: string, date: string) =>
    request<void>(`/routines/${id}/entries/${date}`, { method: 'DELETE' }),
};


// ═══════════════════════════════════════════════════════════════════════════
// FocusSprints API — new Sprint (temporal focus, NOT a step inside Goal)
// ═══════════════════════════════════════════════════════════════════════════
import type { FocusSprint, FocusSprintItemType } from './types';

export const focusSprintsApi = {
  list: () => request<FocusSprint[]>('/focus-sprints'),

  create: (data: {
    title: string;
    description?: string;
    start_date: string;
    end_date: string;
    color?: string;
  }) => request<FocusSprint>('/focus-sprints', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<FocusSprint>) =>
    request<FocusSprint>(`/focus-sprints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/focus-sprints/${id}`, { method: 'DELETE' }),

  addItem: (id: string, item: {
    item_type: FocusSprintItemType;
    goal_id?: string | null;
    step_id?: string | null;
    go_id?: string | null;
    routine_id?: string | null;
  }) => request<FocusSprint>(`/focus-sprints/${id}/items`, {
    method: 'POST',
    body: JSON.stringify(item),
  }),

  removeItem: (id: string, itemId: string) =>
    request<void>(`/focus-sprints/${id}/items/${itemId}`, { method: 'DELETE' }),
};
