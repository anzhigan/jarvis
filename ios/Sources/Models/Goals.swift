import Foundation

// Goals domain — mirrors backend/app/schemas/tasks.py with the frontend's
// preferred naming where it diverges from the backend's legacy:
//
//   Backend "Sprint" = period-bound milestone inside a Goal → Swift `Step`.
//   Backend "FocusSprint" = top-level temporal collection      → Swift `Sprint` (in Sprints.swift).
//
// The wire field `sprints: list[SprintOut]` on TaskOut therefore decodes into
// `Goal.steps: [Step]` via a CodingKeys mapping below. Same goes for
// `Go.sprint_id` → `Go.stepId`.

enum TaskStatus: String, Codable, Sendable, CaseIterable {
    case backlog
    case active
    case paused
    case done
}

enum TaskPriority: String, Codable, Sendable, CaseIterable {
    case low
    case medium
    case high
}

enum GoKind: String, Codable, Sendable {
    case boolean
    case numeric
}

enum GoRecurrence: String, Codable, Sendable {
    case none
    case daily
    case weekly
}

struct GoEntry: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let goId: UUID
    let date: APIDate
    let value: Double
}

struct Go: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let userId: UUID
    let taskId: UUID?     // parent goal
    let stepId: UUID?     // backend field: sprint_id (legacy naming)
    let title: String
    let description: String
    let kind: GoKind
    let unit: String
    let targetValue: Double?
    let recurrence: GoRecurrence
    let startDate: APIDate?
    let dueDate: APIDate?
    let color: String
    let entries: [GoEntry]
    let taskTitle: String?
    let stepTitle: String?      // backend: sprint_title
    let totalValue: Double
    let isDoneToday: Bool
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, userId, taskId
        case stepId        = "sprintId"
        case title, description, kind, unit, targetValue, recurrence
        case startDate, dueDate, color, entries, taskTitle
        case stepTitle     = "sprintTitle"
        case totalValue, isDoneToday, createdAt
    }
}

struct Step: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let taskId: UUID
    let userId: UUID
    let title: String
    let description: String
    let startDate: APIDate
    let endDate: APIDate
    let isCompleted: Bool
    let color: String
    let gos: [Go]
    let taskTitle: String?
    let progress: Int
    let createdAt: Date
    let updatedAt: Date
}

struct Goal: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let title: String
    let description: String
    let status: TaskStatus
    let priority: TaskPriority
    let startDate: APIDate?
    let dueDate: APIDate?
    let isCompleted: Bool
    let order: Int
    let color: String
    let steps: [Step]                 // backend: sprints
    let gos: [Go]
    let tags: [Tag]
    let routines: [GoalRoutineLink]
    let progress: Int
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, description, status, priority
        case startDate, dueDate, isCompleted, order, color
        case steps      = "sprints"
        case gos, tags, routines, progress, createdAt, updatedAt
    }
}
