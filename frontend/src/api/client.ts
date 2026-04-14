// src/api/client.ts
const API_BASE_URL = 'http://localhost:8000'  // FastAPI сервер

export const api = {
  // Notes
  async getAreas() {
    const res = await fetch(`${API_BASE_URL}/notes/areas`)
    return res.json()
  },

  async createArea(name: string) {
    const res = await fetch(`${API_BASE_URL}/notes/areas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    return res.json()
  },

  async getFile(fileId: string) {
    const res = await fetch(`${API_BASE_URL}/notes/files/${fileId}`)
    return res.json()
  },

  async updateFile(fileId: string, content: string) {
    const res = await fetch(`${API_BASE_URL}/notes/files/${fileId}?content=${encodeURIComponent(content)}`, {
      method: 'PUT'
    })
    return res.json()
  },

  async uploadImage(fileId: string, imageFile: File) {
    const formData = new FormData()
    formData.append('image', imageFile)
    const res = await fetch(`${API_BASE_URL}/notes/files/${fileId}/images`, {
      method: 'POST',
      body: formData
    })
    return res.json()
  },

  // Tasks
  async getTasks(status?: string, priority?: string) {
    let url = `${API_BASE_URL}/tasks`
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (priority) params.append('priority', priority)
    if (params.toString()) url += `?${params.toString()}`
    const res = await fetch(url)
    return res.json()
  },

  async createTask(task: any) {
    const res = await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    })
    return res.json()
  },

  async updateTaskStatus(taskId: string, status: string) {
    const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/status?status=${status}`, {
      method: 'PATCH'
    })
    return res.json()
  },

  async deleteTask(taskId: string) {
    const res = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
      method: 'DELETE'
    })
    return res.json()
  },

  // Metrics
  async getMetrics() {
    const res = await fetch(`${API_BASE_URL}/metrics`)
    return res.json()
  },

  async getWeeklyProgress() {
    const res = await fetch(`${API_BASE_URL}/metrics/weekly`)
    return res.json()
  },

  async getDistribution() {
    const res = await fetch(`${API_BASE_URL}/metrics/distribution`)
    return res.json()
  }
}