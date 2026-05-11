import Foundation
import SwiftUI

// Sprints tab data layer. Loads four collections in parallel (sprints, goals,
// gos, routines), derives steps from goals, and exposes lookup tables that
// the disc card uses to walk children. Same "patch in place via reload"
// strategy as the other tabs.

@MainActor
final class SprintsViewModel: ObservableObject {
    @Published private(set) var sprints: [Sprint] = []
    @Published private(set) var goals: [Goal] = []
    @Published private(set) var gos: [Go] = []
    @Published private(set) var routines: [Routine] = []
    @Published private(set) var isLoading = false
    @Published var error: String?

    private let repos: Repositories

    init(repos: Repositories) { self.repos = repos }

    // Steps live nested inside goals.steps — flatten for tree building.
    var steps: [Step] { goals.flatMap { $0.steps } }

    var goalsById:    [UUID: Goal]    { Dictionary(uniqueKeysWithValues: goals.map { ($0.id, $0) }) }
    var stepsById:    [UUID: Step]    { Dictionary(uniqueKeysWithValues: steps.map { ($0.id, $0) }) }
    var gosById:      [UUID: Go]      { Dictionary(uniqueKeysWithValues: gos.map   { ($0.id, $0) }) }
    var routinesById: [UUID: Routine] { Dictionary(uniqueKeysWithValues: routines.map { ($0.id, $0) }) }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        async let sCall = repos.sprints.listSprints()
        async let gCall = repos.goals.listGoals()
        async let goCall = repos.gos.listGos()
        async let rCall = repos.routines.listRoutines()
        do {
            sprints  = try await sCall
            goals    = try await gCall
            gos      = try await goCall
            routines = try await rCall
        } catch let err as APIError { error = err.localizedDescription }
        catch let err              { error = err.localizedDescription }
    }

    // MARK: - Mutations

    func createSprint(_ create: SprintCreate) async {
        do { _ = try await repos.sprints.createSprint(create); await load() }
        catch let err { error = err.localizedDescription }
    }
    func updateSprint(id: UUID, _ patch: SprintPatch) async {
        do { _ = try await repos.sprints.updateSprint(id: id, patch); await load() }
        catch let err { error = err.localizedDescription }
    }
    func deleteSprint(_ id: UUID) async {
        do { try await repos.sprints.deleteSprint(id: id); await load() }
        catch let err { error = err.localizedDescription }
    }
    func addItem(sprintId: UUID, _ item: SprintItemAdd) async {
        do { _ = try await repos.sprints.addItem(sprintId: sprintId, item); await load() }
        catch let err { error = err.localizedDescription }
    }
}

// MARK: - SprintWithProgress

/// Decorate a Sprint with computed time-progress metrics. Mirrors web's
/// `SprintWithProgress` so the disc card consumes the same shape.
struct SprintWithProgress: Identifiable {
    enum Bucket: String { case active, upcoming, past }
    let sprint: Sprint
    let daysTotal: Int
    let daysElapsed: Int
    let daysRemaining: Int
    let progress: Double      // 0..1 fraction of time elapsed
    let bucket: Bucket
    var id: UUID { sprint.id }
}

extension Sprint {
    func decorate(today: Date = Date()) -> SprintWithProgress {
        let cal = Calendar.current
        let start = startDate.date()
        let end   = endDate.date()
        let total = max(1, cal.dateComponents([.day], from: start, to: end).day ?? 0)
        let elapsed: Int
        let now = today
        if now < start { elapsed = 0 }
        else if now > end { elapsed = total }
        else { elapsed = cal.dateComponents([.day], from: start, to: now).day ?? 0 }
        let remaining = max(0, total - elapsed)
        let progress  = total > 0 ? Double(elapsed) / Double(total) : 0

        let bucket: SprintWithProgress.Bucket
        if APIDate(now) < startDate      { bucket = .upcoming }
        else if endDate < APIDate(now)   { bucket = .past }
        else                             { bucket = .active }

        return SprintWithProgress(
            sprint: self, daysTotal: total, daysElapsed: elapsed,
            daysRemaining: remaining, progress: progress, bucket: bucket
        )
    }
}
