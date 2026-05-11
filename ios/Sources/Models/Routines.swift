import Foundation

// Routines domain — recurring activity tracking. Mirrors RoutineOut /
// RoutineEntryOut / GoalRoutineLinkOut from backend/app/schemas/tasks.py.

enum RoutineScheduleType: String, Codable, Sendable {
    case daily
    case weeklyOnDays = "weekly_on_days"
    case everyNDays   = "every_n_days"
    case timesPerWeek = "times_per_week"
}

enum RoutinePeriod: String, Codable, Sendable {
    case week
    case month
}

enum RoutineKind: String, Codable, Sendable {
    case boolean
    case numeric
}

struct RoutineEntry: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let routineId: UUID
    let date: APIDate
    let value: Double
}

struct Routine: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let userId: UUID
    let goalId: UUID?
    let stepId: UUID?
    let title: String
    let description: String
    let color: String
    let scheduleType: RoutineScheduleType
    let scheduleDays: String          // CSV "0,2,4" — Mon/Wed/Fri etc
    let scheduleNDays: Int
    let scheduleCountPerPeriod: Int
    let schedulePeriod: RoutinePeriod
    let startDate: APIDate?
    let endDate: APIDate?
    let isPaused: Bool
    let kind: RoutineKind
    let unit: String
    let targetValue: Double?
    let entries: [RoutineEntry]
    let createdAt: Date
    let updatedAt: Date
}

// Goal ↔ Routine join with optional bounded period and target_count.
struct GoalRoutineLink: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let goalId: UUID
    let routineId: UUID
    let startDate: APIDate
    let endDate: APIDate?
    let targetCount: Int?
    let routine: Routine
}
