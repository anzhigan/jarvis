import Foundation

// Repository protocols — every feature in the app reaches through one of
// these instead of touching APIClient directly. Two reasons:
//   1) SwiftData cache layer lands in Stage 11 by swapping the implementation
//      without rewriting consumers.
//   2) Tests can inject a stub conforming to the same protocol.
//
// HTTP-backed implementations live below. Each method maps 1:1 to a backend
// endpoint; request/response bodies are small DTOs that aren't worth their
// own file (kept inline for grep-ability).

// MARK: - Notes

protocol NotesRepository: Sendable {
    func listWays() async throws -> [Way]
    func createWay(name: String, order: Int) async throws -> Way
    func updateWay(id: UUID, name: String?, order: Int?) async throws -> Way
    func deleteWay(id: UUID) async throws

    func createTopic(wayId: UUID, name: String, order: Int) async throws -> Topic
    func updateTopic(id: UUID, name: String?, order: Int?) async throws -> Topic
    func deleteTopic(id: UUID) async throws

    func createNote(name: String, wayId: UUID?, topicId: UUID?) async throws -> Note
    func updateNote(id: UUID, name: String?, content: String?, pinned: Bool?, order: Int?) async throws -> Note
    func reparentNote(id: UUID, wayId: UUID?, topicId: UUID?) async throws -> Note
    func deleteNote(id: UUID) async throws

    func uploadNoteImage(noteId: UUID, data: Data, filename: String, mime: String) async throws -> NoteImage
}

final class HTTPNotesRepository: NotesRepository {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func listWays() async throws -> [Way] {
        try await OfflineCache.shared.wrap(.ways) { try await api.get("ways") }
    }
    func createWay(name: String, order: Int) async throws -> Way {
        struct Body: Encodable { let name: String; let order: Int }
        return try await api.post("ways", body: Body(name: name, order: order))
    }
    func updateWay(id: UUID, name: String?, order: Int?) async throws -> Way {
        struct Body: Encodable { let name: String?; let order: Int? }
        return try await api.patch("ways/\(id)", body: Body(name: name, order: order))
    }
    func deleteWay(id: UUID) async throws {
        try await api.delete("ways/\(id)")
    }

    func createTopic(wayId: UUID, name: String, order: Int) async throws -> Topic {
        struct Body: Encodable { let name: String; let order: Int }
        return try await api.post("ways/\(wayId)/topics", body: Body(name: name, order: order))
    }
    func updateTopic(id: UUID, name: String?, order: Int?) async throws -> Topic {
        struct Body: Encodable { let name: String?; let order: Int? }
        return try await api.patch("topics/\(id)", body: Body(name: name, order: order))
    }
    func deleteTopic(id: UUID) async throws {
        try await api.delete("topics/\(id)")
    }

    func createNote(name: String, wayId: UUID?, topicId: UUID?) async throws -> Note {
        struct Body: Encodable {
            let name: String
            let wayId: UUID?
            let topicId: UUID?
        }
        return try await api.post("notes", body: Body(name: name, wayId: wayId, topicId: topicId))
    }
    func updateNote(id: UUID, name: String?, content: String?, pinned: Bool?, order: Int?) async throws -> Note {
        struct Body: Encodable {
            let name: String?
            let content: String?
            let pinned: Bool?
            let order: Int?
        }
        return try await api.patch("notes/\(id)", body: Body(name: name, content: content, pinned: pinned, order: order))
    }
    func reparentNote(id: UUID, wayId: UUID?, topicId: UUID?) async throws -> Note {
        struct Body: Encodable { let wayId: UUID?; let topicId: UUID? }
        return try await api.post("notes/\(id)/move", body: Body(wayId: wayId, topicId: topicId))
    }
    func deleteNote(id: UUID) async throws {
        try await api.delete("notes/\(id)")
    }

    // Multipart upload — APIClient's JSON helpers don't fit; build the request
    // by hand. Backend endpoint signature: POST /notes/{id}/images with `file`
    // form field.
    func uploadNoteImage(noteId: UUID, data: Data, filename: String, mime: String) async throws -> NoteImage {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        var req = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent("notes/\(noteId)/images"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.setValue(AppConfig.userAgent, forHTTPHeaderField: "User-Agent")
        if let token = await api.tokens.accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = body

        let (responseData, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.http(status: (response as? HTTPURLResponse)?.statusCode ?? -1, detail: nil)
        }
        return try APIClient.decoder.decode(NoteImage.self, from: responseData)
    }
}

// MARK: - Goals

protocol GoalsRepository: Sendable {
    func listGoals() async throws -> [Goal]
    func createGoal(_ create: GoalCreate) async throws -> Goal
    func updateGoal(id: UUID, _ patch: GoalPatch) async throws -> Goal
    func deleteGoal(id: UUID) async throws
    func attachTag(goalId: UUID, tagId: UUID) async throws
    func detachTag(goalId: UUID, tagId: UUID) async throws
    // attachTag/detachTag map to POST/DELETE /tasks/{id}/tags/{tagId} —
    // wired in Stage 6 when Goals UI lands.
}

struct GoalCreate: Encodable {
    let title: String
    let description: String
    let status: TaskStatus
    let priority: TaskPriority
    let startDate: APIDate?
    let dueDate: APIDate?
    let order: Int
    let color: String
    let tagIds: [UUID]
}

struct GoalPatch: Encodable {
    let title: String?
    let description: String?
    let status: TaskStatus?
    let priority: TaskPriority?
    let startDate: APIDate?
    let dueDate: APIDate?
    let isCompleted: Bool?
    let order: Int?
    let color: String?
}

final class HTTPGoalsRepository: GoalsRepository {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func listGoals() async throws -> [Goal] {
        try await OfflineCache.shared.wrap(.goals) { try await api.get("tasks") }
    }
    func createGoal(_ create: GoalCreate) async throws -> Goal {
        try await api.post("tasks", body: create)
    }
    func updateGoal(id: UUID, _ patch: GoalPatch) async throws -> Goal {
        try await api.patch("tasks/\(id)", body: patch)
    }
    func deleteGoal(id: UUID) async throws {
        try await api.delete("tasks/\(id)")
    }
    func attachTag(goalId: UUID, tagId: UUID) async throws {
        let _: EmptyResponse = try await api.post("tasks/\(goalId)/tags/\(tagId)", body: EmptyBody())
    }
    func detachTag(goalId: UUID, tagId: UUID) async throws {
        try await api.delete("tasks/\(goalId)/tags/\(tagId)")
    }
}

// MARK: - Steps (backend model "Sprint", route /api/sprints)

protocol StepsRepository: Sendable {
    func listSteps() async throws -> [Step]
    func createStep(_ create: StepCreate) async throws -> Step
    func updateStep(id: UUID, _ patch: StepPatch) async throws -> Step
    func deleteStep(id: UUID) async throws
}

struct StepCreate: Encodable {
    let taskId: UUID
    let title: String
    let description: String
    let startDate: APIDate
    let endDate: APIDate
    let color: String
}

struct StepPatch: Encodable {
    let title: String?
    let description: String?
    let startDate: APIDate?
    let endDate: APIDate?
    let isCompleted: Bool?
    let color: String?
    let taskId: UUID?
}

final class HTTPStepsRepository: StepsRepository {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func listSteps() async throws -> [Step] {
        try await api.get("sprints")
    }
    func createStep(_ create: StepCreate) async throws -> Step {
        try await api.post("sprints", body: create)
    }
    func updateStep(id: UUID, _ patch: StepPatch) async throws -> Step {
        try await api.patch("sprints/\(id)", body: patch)
    }
    func deleteStep(id: UUID) async throws {
        try await api.delete("sprints/\(id)")
    }
}

// MARK: - Gos

protocol GosRepository: Sendable {
    func listGos() async throws -> [Go]
    func createGo(_ create: GoCreate) async throws -> Go
    func updateGo(id: UUID, _ patch: GoPatch) async throws -> Go
    func deleteGo(id: UUID) async throws
    func upsertEntry(goId: UUID, date: APIDate, value: Double) async throws -> GoEntry
}

struct GoCreate: Encodable {
    let title: String
    let description: String
    let kind: GoKind
    let unit: String
    let targetValue: Double?
    let recurrence: GoRecurrence
    let startDate: APIDate?
    let dueDate: APIDate?
    let color: String
    let taskId: UUID?
    let stepId: UUID?

    enum CodingKeys: String, CodingKey {
        case title, description, kind, unit, targetValue, recurrence
        case startDate, dueDate, color, taskId
        case stepId = "sprintId"     // backend legacy field
    }
}

struct GoPatch: Encodable {
    let title: String?
    let description: String?
    let kind: GoKind?
    let unit: String?
    let targetValue: Double?
    let recurrence: GoRecurrence?
    let startDate: APIDate?
    let dueDate: APIDate?
    let color: String?
    let taskId: UUID?
    let stepId: UUID?

    enum CodingKeys: String, CodingKey {
        case title, description, kind, unit, targetValue, recurrence
        case startDate, dueDate, color, taskId
        case stepId = "sprintId"
    }
}

final class HTTPGosRepository: GosRepository {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func listGos() async throws -> [Go] {
        try await OfflineCache.shared.wrap(.gos) { try await api.get("gos") }
    }
    func createGo(_ create: GoCreate) async throws -> Go {
        try await api.post("gos", body: create)
    }
    func updateGo(id: UUID, _ patch: GoPatch) async throws -> Go {
        try await api.patch("gos/\(id)", body: patch)
    }
    func deleteGo(id: UUID) async throws {
        try await api.delete("gos/\(id)")
    }
    func upsertEntry(goId: UUID, date: APIDate, value: Double) async throws -> GoEntry {
        // Backend returns just the GoEntry, not the whole Go. Same trap that
        // the routines endpoint had — decoding it as Go would fail JSON parse
        // and bubble up as "couldn't read server response".
        struct Body: Encodable { let date: APIDate; let value: Double }
        return try await api.post("gos/\(goId)/entries", body: Body(date: date, value: value))
    }
}

// MARK: - Routines

protocol RoutinesRepository: Sendable {
    func listRoutines() async throws -> [Routine]
    func createRoutine(_ create: RoutineCreate) async throws -> Routine
    func updateRoutine(id: UUID, _ patch: RoutinePatch) async throws -> Routine
    func deleteRoutine(id: UUID) async throws
    func upsertEntry(routineId: UUID, date: APIDate, value: Double) async throws -> RoutineEntry
    func deleteEntry(routineId: UUID, date: APIDate) async throws
}

struct RoutineCreate: Encodable {
    let title: String
    let description: String
    let color: String
    let goalId: UUID?
    let stepId: UUID?
    let scheduleType: RoutineScheduleType
    let scheduleDays: String
    let scheduleNDays: Int
    let scheduleCountPerPeriod: Int
    let schedulePeriod: RoutinePeriod
    let startDate: APIDate?
    let endDate: APIDate?
    let isPaused: Bool
    let kind: RoutineKind
    let unit: String
    let targetValue: Double?
}

struct RoutinePatch: Encodable {
    let title: String?
    let description: String?
    let color: String?
    let goalId: UUID?
    let stepId: UUID?
    let scheduleType: RoutineScheduleType?
    let scheduleDays: String?
    let scheduleNDays: Int?
    let scheduleCountPerPeriod: Int?
    let schedulePeriod: RoutinePeriod?
    let startDate: APIDate?
    let endDate: APIDate?
    let isPaused: Bool?
    let kind: RoutineKind?
    let unit: String?
    let targetValue: Double?
}

final class HTTPRoutinesRepository: RoutinesRepository {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func listRoutines() async throws -> [Routine] {
        try await OfflineCache.shared.wrap(.routines) { try await api.get("routines") }
    }
    func createRoutine(_ create: RoutineCreate) async throws -> Routine {
        try await api.post("routines", body: create)
    }
    func updateRoutine(id: UUID, _ patch: RoutinePatch) async throws -> Routine {
        try await api.patch("routines/\(id)", body: patch)
    }
    func deleteRoutine(id: UUID) async throws {
        try await api.delete("routines/\(id)")
    }
    func upsertEntry(routineId: UUID, date: APIDate, value: Double) async throws -> RoutineEntry {
        // Backend returns the upserted entry, not the whole Routine. We discard
        // the result on the call site and reload via list — but the decoded
        // type still has to match the wire shape, otherwise JSON parsing trips
        // and the user sees "Something went wrong" with no explanation.
        struct Body: Encodable { let date: APIDate; let value: Double }
        return try await api.post("routines/\(routineId)/entries", body: Body(date: date, value: value))
    }
    func deleteEntry(routineId: UUID, date: APIDate) async throws {
        try await api.delete("routines/\(routineId)/entries/\(date.string)")
    }
}

// MARK: - Sprints (backend "FocusSprint", route /api/focus-sprints)

protocol SprintsRepository: Sendable {
    func listSprints() async throws -> [Sprint]
    func createSprint(_ create: SprintCreate) async throws -> Sprint
    func updateSprint(id: UUID, _ patch: SprintPatch) async throws -> Sprint
    func deleteSprint(id: UUID) async throws
    func addItem(sprintId: UUID, _ item: SprintItemAdd) async throws -> Sprint
    func removeItem(sprintId: UUID, itemId: UUID) async throws
}

struct SprintCreate: Encodable {
    let title: String
    let description: String
    let startDate: APIDate
    let endDate: APIDate
    let color: String
}

struct SprintPatch: Encodable {
    let title: String?
    let description: String?
    let startDate: APIDate?
    let endDate: APIDate?
    let color: String?
    let isArchived: Bool?
}

struct SprintItemAdd: Encodable {
    let itemType: SprintItemType
    let goalId: UUID?
    let stepId: UUID?
    let goId: UUID?
    let routineId: UUID?
}

final class HTTPSprintsRepository: SprintsRepository {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func listSprints() async throws -> [Sprint] {
        try await OfflineCache.shared.wrap(.sprints) { try await api.get("focus-sprints") }
    }
    func createSprint(_ create: SprintCreate) async throws -> Sprint {
        try await api.post("focus-sprints", body: create)
    }
    func updateSprint(id: UUID, _ patch: SprintPatch) async throws -> Sprint {
        try await api.patch("focus-sprints/\(id)", body: patch)
    }
    func deleteSprint(id: UUID) async throws {
        try await api.delete("focus-sprints/\(id)")
    }
    func addItem(sprintId: UUID, _ item: SprintItemAdd) async throws -> Sprint {
        try await api.post("focus-sprints/\(sprintId)/items", body: item)
    }
    func removeItem(sprintId: UUID, itemId: UUID) async throws {
        try await api.delete("focus-sprints/\(sprintId)/items/\(itemId)")
    }
}

// MARK: - Tags

protocol TagsRepository: Sendable {
    func listTags() async throws -> [Tag]
    func createTag(name: String, color: String) async throws -> Tag
    func updateTag(id: UUID, name: String?, color: String?) async throws -> Tag
    func deleteTag(id: UUID) async throws
}

final class HTTPTagsRepository: TagsRepository {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func listTags() async throws -> [Tag] {
        try await OfflineCache.shared.wrap(.tags) { try await api.get("tags") }
    }
    func createTag(name: String, color: String) async throws -> Tag {
        struct Body: Encodable { let name: String; let color: String }
        return try await api.post("tags", body: Body(name: name, color: color))
    }
    func updateTag(id: UUID, name: String?, color: String?) async throws -> Tag {
        struct Body: Encodable { let name: String?; let color: String? }
        return try await api.patch("tags/\(id)", body: Body(name: name, color: color))
    }
    func deleteTag(id: UUID) async throws { try await api.delete("tags/\(id)") }
}

// MARK: - Aggregator passed via Environment so views don't have to pin
// individual protocol types.

@MainActor
final class Repositories: ObservableObject {
    let notes:    any NotesRepository
    let goals:    any GoalsRepository
    let steps:    any StepsRepository
    let gos:      any GosRepository
    let routines: any RoutinesRepository
    let sprints:  any SprintsRepository
    let tags:     any TagsRepository

    init(api: APIClient = .shared) {
        notes    = HTTPNotesRepository(api: api)
        goals    = HTTPGoalsRepository(api: api)
        steps    = HTTPStepsRepository(api: api)
        gos      = HTTPGosRepository(api: api)
        routines = HTTPRoutinesRepository(api: api)
        sprints  = HTTPSprintsRepository(api: api)
        tags     = HTTPTagsRepository(api: api)
    }
}
