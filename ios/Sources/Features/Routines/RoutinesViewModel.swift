import Foundation
import SwiftUI

@MainActor
final class RoutinesViewModel: ObservableObject {
    @Published private(set) var routines: [Routine] = []
    @Published private(set) var goals: [Goal] = []
    @Published private(set) var isLoading: Bool = false
    @Published var error: String?

    private let repo: any RoutinesRepository
    private let goalsRepo: any GoalsRepository

    init(repos: Repositories) {
        self.repo = repos.routines
        self.goalsRepo = repos.goals
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        async let r = repo.listRoutines()
        async let g = goalsRepo.listGoals()
        do {
            routines = try await r
            goals    = try await g
        } catch let err as APIError { error = err.localizedDescription }
        catch let err              { error = err.localizedDescription }
    }

    func goal(_ id: UUID?) -> Goal? {
        guard let id else { return nil }
        return goals.first { $0.id == id }
    }

    // MARK: - Mutations

    func create(_ create: RoutineCreate) async {
        do { _ = try await repo.createRoutine(create); await load() }
        catch let err { error = err.localizedDescription }
    }
    func update(id: UUID, _ patch: RoutinePatch) async {
        do { _ = try await repo.updateRoutine(id: id, patch); await load() }
        catch let err { error = err.localizedDescription }
    }
    func delete(_ id: UUID) async {
        do { try await repo.deleteRoutine(id: id); await load() }
        catch let err { error = err.localizedDescription }
    }

    /// Tap "done" cell/button for a specific date — toggle:
    ///  - currently done (>0)  → delete the entry
    ///  - currently empty/skip → upsert with value 1
    func toggleDone(_ routine: Routine, date: APIDate) async {
        let cur = routine.entries.first { $0.date == date }
        do {
            if let cur, cur.value > 0 {
                try await repo.deleteEntry(routineId: routine.id, date: date)
            } else {
                _ = try await repo.upsertEntry(routineId: routine.id, date: date, value: 1)
            }
            await load()
        } catch let err { error = err.localizedDescription }
    }

    /// Tap "skip" — same toggle but with value 0 (explicitly skipped).
    func toggleSkip(_ routine: Routine, date: APIDate) async {
        let cur = routine.entries.first { $0.date == date }
        do {
            if let cur, cur.value == 0 {
                try await repo.deleteEntry(routineId: routine.id, date: date)
            } else {
                _ = try await repo.upsertEntry(routineId: routine.id, date: date, value: 0)
            }
            await load()
        } catch let err { error = err.localizedDescription }
    }
}
