import type {
  Metric,
  MetricEntry,
  Note,
  NoteImage,
  Task,
  TaskPriority,
  TaskStatus,
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
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
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
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    }),

  login: async (email: string, password: string) => {
    const data = await request<{ access_token: string; refresh_token: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },

  me: () => request<User>('/auth/me'),
};

// ── Ways ──────────────────────────────────────────────────────────────────────
export const waysApi = {
  list: () => request<Way[]>('/ways'),
  create: (name: string, order = 0) =>
    request<Way>('/ways', { method: 'POST', body: JSON.stringify({ name, order }) }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request<Way>(`/ways/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/ways/${id}`, { method: 'DELETE' }),
};

// ── Topics ────────────────────────────────────────────────────────────────────
export const topicsApi = {
  create: (wayId: string, name: string, order = 0) =>
    request<any>(`/ways/${wayId}/topics`, {
      method: 'POST',
      body: JSON.stringify({ name, order }),
    }),
  update: (id: string, data: { name?: string; order?: number }) =>
    request<any>(`/topics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/topics/${id}`, { method: 'DELETE' }),
};

// ── Notes ─────────────────────────────────────────────────────────────────────
export const notesApi = {
  create: (data: {
    name: string;
    content?: string;
    way_id?: string;
    topic_id?: string;
    topic_inline_id?: string;
  }) => request<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { name?: string; content?: string }) =>
    request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/notes/${id}`, { method: 'DELETE' }),

  uploadImage: (noteId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<NoteImage>(`/notes/${noteId}/images`, {
      method: 'POST',
      body: form,
    });
  },
};

// ── Tasks ─────────────────────────────────────────────────────────────────────
export const tasksApi = {
  list: (status?: TaskStatus) =>
    request<Task[]>(`/tasks${status ? `?status_filter=${status}` : ''}`),
  create: (data: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    due_date?: string | null;
  }) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  update: (
    id: string,
    data: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      due_date?: string | null;
      is_completed?: boolean;
      order?: number;
    }
  ) => request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};

// ── Metrics ───────────────────────────────────────────────────────────────────
export const metricsApi = {
  list: () => request<Metric[]>('/metrics'),
  create: (data: {
    name: string;
    unit?: string;
    target_value?: number | null;
    color?: string;
    description?: string;
  }) => request<Metric>('/metrics', { method: 'POST', body: JSON.stringify(data) }),
  update: (
    id: string,
    data: { name?: string; unit?: string; target_value?: number | null; color?: string }
  ) => request<Metric>(`/metrics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/metrics/${id}`, { method: 'DELETE' }),
  addEntry: (metricId: string, value: number, date: string, note = '') =>
    request<MetricEntry>(`/metrics/${metricId}/entries`, {
      method: 'POST',
      body: JSON.stringify({ value, date, note }),
    }),
  deleteEntry: (metricId: string, entryId: string) =>
    request<void>(`/metrics/${metricId}/entries/${entryId}`, { method: 'DELETE' }),
};
