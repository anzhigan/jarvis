import Foundation

// Sprints domain — temporal collection that pulls together existing entities.
// Backend model is `FocusSprint` (because plain `Sprint` is taken by the legacy
// "Step inside a Goal" type). On the wire: /api/focus-sprints.

enum SprintItemType: String, Codable, Sendable {
    case goal
    case step
    case go
    case routine
}

struct SprintItem: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let itemType: SprintItemType
    let goalId: UUID?
    let stepId: UUID?
    let goId: UUID?
    let routineId: UUID?
    // Hydrated server-side for convenience.
    let title: String?
    let color: String?
}

struct Sprint: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    let userId: UUID
    let title: String
    let description: String
    let startDate: APIDate
    let endDate: APIDate
    let color: String
    let isArchived: Bool
    let items: [SprintItem]
    let createdAt: Date
    let updatedAt: Date
}
