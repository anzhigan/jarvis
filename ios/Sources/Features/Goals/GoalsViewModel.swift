import Foundation
import SwiftUI

// Single source of truth for the Goals tab. Loads goals, steps, gos, and
// routines in parallel; the three child screens (Kanban / Go / Step) just
// observe slices of the same vm. Mutations roundtrip through the repos and
// reload the affected list — same "patch in place after success" pattern as
// NotesViewModel, but with three top-level entities.

@MainActor
final class GoalsViewModel: ObservableObject {
    @Published private(set) var goals: [Goal] = []
    @Published private(set) var gos:   [Go]   = []
    @Published private(set) var routines: [Routine] = []
    @Published private(set) var isLoading: Bool = false
    @Published var error: String?

    /// Steps live nested inside Goal.steps in the API; flatten them here so
    /// callers can do `vm.steps` without traversing the goals tree every time.
    var steps: [Step] { goals.flatMap { $0.steps } }

    private let goalsRepo: any GoalsRepository
    private let stepsRepo: any StepsRepository
    private let gosRepo:   any GosRepository
    private let routinesRepo: any RoutinesRepository

    init(repos: Repositories) {
        self.goalsRepo = repos.goals
        self.stepsRepo = repos.steps
        self.gosRepo   = repos.gos
        self.routinesRepo = repos.routines
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        defer { isLoading = false }
        // Three parallel calls (steps come from goals.sprints). Whoever finishes
        // last clears the spinner.
        async let goalsCall    = goalsRepo.listGoals()
        async let gosCall      = gosRepo.listGos()
        async let routinesCall = routinesRepo.listRoutines()
        do {
            self.goals    = try await goalsCall.sorted { $0.order < $1.order }
            self.gos      = try await gosCall
            self.routines = try await routinesCall
        } catch let err as APIError {
            error = err.localizedDescription
        } catch let err {
            error = err.localizedDescription
        }
    }

    // MARK: - Lookups

    func goal(_ id: UUID)    -> Goal?    { goals.first { $0.id == id } }
    func step(_ id: UUID)    -> Step?    { steps.first { $0.id == id } }
    func go(_ id: UUID)      -> Go?      { gos.first   { $0.id == id } }
    func routine(_ id: UUID) -> Routine? { routines.first { $0.id == id } }

    /// Steps that belong to a given goal — backend stores `task_id` on Step.
    func steps(forGoal goalId: UUID) -> [Step] {
        steps.filter { $0.taskId == goalId }
    }
    /// Gos directly attached to a goal (no step parent).
    func standaloneGos(forGoal goalId: UUID) -> [Go] {
        gos.filter { $0.taskId == goalId && $0.stepId == nil }
    }
    /// Gos attached to a step.
    func gos(forStep stepId: UUID) -> [Go] {
        gos.filter { $0.stepId == stepId }
    }

    // MARK: - Goal CRUD

    func createGoal(_ create: GoalCreate) async {
        do { _ = try await goalsRepo.createGoal(create); await load() }
        catch let err { error = err.localizedDescription }
    }
    func updateGoal(id: UUID, _ patch: GoalPatch) async {
        do { _ = try await goalsRepo.updateGoal(id: id, patch); await load() }
        catch let err { error = err.localizedDescription }
    }
    func deleteGoal(_ id: UUID) async {
        do { try await goalsRepo.deleteGoal(id: id); await load() }
        catch let err { error = err.localizedDescription }
    }

    // MARK: - Step CRUD

    func createStep(_ create: StepCreate) async {
        do { _ = try await stepsRepo.createStep(create); await load() }
        catch let err { error = err.localizedDescription }
    }
    func updateStep(id: UUID, _ patch: StepPatch) async {
        do { _ = try await stepsRepo.updateStep(id: id, patch); await load() }
        catch let err { error = err.localizedDescription }
    }
    func deleteStep(_ id: UUID) async {
        do { try await stepsRepo.deleteStep(id: id); await load() }
        catch let err { error = err.localizedDescription }
    }
    func toggleStepDone(_ step: Step) async {
        let patch = StepPatch(title: nil, description: nil, startDate: nil, endDate: nil,
                              isCompleted: !step.isCompleted, color: nil, taskId: nil)
        await updateStep(id: step.id, patch)
    }

    // MARK: - Go CRUD

    func createGo(_ create: GoCreate) async {
        do { _ = try await gosRepo.createGo(create); await load() }
        catch let err { error = err.localizedDescription }
    }
    func updateGo(id: UUID, _ patch: GoPatch) async {
        do { _ = try await gosRepo.updateGo(id: id, patch); await load() }
        catch let err { error = err.localizedDescription }
    }
    func deleteGo(_ id: UUID) async {
        do { try await gosRepo.deleteGo(id: id); await load() }
        catch let err { error = err.localizedDescription }
    }

    /// Toggle today's value: 0 if currently met, else target (numeric) or 1 (bool).
    func toggleDoneToday(_ go: Go) async {
        let next: Double = go.isDoneToday
            ? 0
            : (go.kind == .numeric ? (go.targetValue ?? 1) : 1)
        do {
            _ = try await gosRepo.upsertEntry(goId: go.id, date: APIDate.today(), value: next)
            await load()
        } catch let err { error = err.localizedDescription }
    }
    func logToday(_ go: Go, value: Double) async {
        do {
            _ = try await gosRepo.upsertEntry(goId: go.id, date: APIDate.today(), value: value)
            await load()
        } catch let err { error = err.localizedDescription }
    }
}
