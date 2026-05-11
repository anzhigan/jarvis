import SwiftUI

// Root of the Goals tab. Owns the segmented mode picker, the form sheets
// (Goal / Step / Go), and the shared GoalsViewModel that the three views
// observe.

struct GoalsTabRoot: View {
    @EnvironmentObject private var auth: AuthService
    @StateObject private var vm: GoalsViewModel
    @State private var mode: Mode = GoalsTabRoot.initialMode()
    @State private var statusFilter: TaskStatus? = .active
    @State private var priorityFilter: Set<TaskPriority> = []
    @State private var sheet: ActiveSheet? = nil

    private var avatarInitial: String {
        auth.currentUser?.username.first.map { String($0) } ?? "?"
    }
    private var subtitleText: String {
        let active  = vm.goals.filter { $0.status == .active  }.count
        let backlog = vm.goals.filter { $0.status == .backlog }.count
        return "\(active) active · \(backlog) in backlog"
    }

    /// Honour `-JARV_GOALS_MODE kanban|go|step` for screenshot scripts.
    private static func initialMode() -> Mode {
        #if DEBUG
        switch UserDefaults.standard.string(forKey: "JARV_GOALS_MODE") {
        case "go":   return .go
        case "step": return .step
        default:     return .kanban
        }
        #else
        return .kanban
        #endif
    }

    init(repos: Repositories) {
        _vm = StateObject(wrappedValue: GoalsViewModel(repos: repos))
    }

    enum Mode: String, CaseIterable, Identifiable {
        case kanban, go, step
        var id: Self { self }
        var label: String {
            switch self {
            case .kanban: return "Kanban"
            case .go:     return "Go"
            case .step:   return "Step"
            }
        }
    }

    enum ActiveSheet: Identifiable {
        case createGoal
        case editGoal(Goal)
        case createStep
        case editStep(Step)
        case createGo
        case editGo(Go)

        var id: String {
            switch self {
            case .createGoal:        return "createGoal"
            case .editGoal(let g):   return "editGoal-\(g.id)"
            case .createStep:        return "createStep"
            case .editStep(let s):   return "editStep-\(s.id)"
            case .createGo:          return "createGo"
            case .editGo(let g):     return "editGo-\(g.id)"
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            MobileTopBar(title: "Goals", subtitle: subtitleText, avatarInitial: avatarInitial)
            VStack(spacing: 0) {
                modePicker
                    .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 4)

                Group {
                    switch mode {
                    case .kanban:
                        KanbanView(
                            vm: vm,
                            statusFilter: $statusFilter,
                            priorityFilter: $priorityFilter,
                            onCreateGoal: { sheet = .createGoal },
                            onEditGoal:   { sheet = .editGoal($0) }
                        )
                    case .go:
                        GoView(
                            vm: vm,
                            onCreateGo: { sheet = .createGo },
                            onEditGo:   { sheet = .editGo($0) }
                        )
                    case .step:
                        StepView(
                            vm: vm,
                            onCreateStep: { sheet = .createStep },
                            onEditStep:   { sheet = .editStep($0) }
                        )
                    }
                }
            }
            .background(Theme.Color.paper.ignoresSafeArea())
        }
        .task {
            if vm.goals.isEmpty { await vm.load() }
        }
        .sheet(item: $sheet) { active in
            switch active {
            case .createGoal:
                GoalForm(vm: vm, editing: nil)
            case .editGoal(let g):
                GoalForm(vm: vm, editing: g)
            case .createStep:
                StepForm(vm: vm, editing: nil, initialGoalId: nil)
            case .editStep(let s):
                StepForm(vm: vm, editing: s, initialGoalId: nil)
            case .createGo:
                GoForm(vm: vm, editing: nil, initialTaskId: nil, initialStepId: nil)
            case .editGo(let g):
                GoForm(vm: vm, editing: g, initialTaskId: nil, initialStepId: nil)
            }
        }
        .alert("Something went wrong",
               isPresented: Binding(
                    get: { vm.error != nil },
                    set: { if !$0 { vm.error = nil } }
               ),
               presenting: vm.error) { _ in
            Button("OK") { vm.error = nil }
        } message: { msg in
            Text(msg)
        }
    }

    // 1-for-1 port of `.goals-segmented` + `.seg-btn[data-active]`:
    //   container: 3-col grid, padding 3, bg cream, radius 10, gap 2
    //   pill (idle):   height 38, radius 8, transparent, ink-3, font-ui 14/500
    //   pill (active): bg paper, ink, weight 600, soft drop-shadow
    private var modePicker: some View {
        HStack(spacing: 2) {
            ForEach(Mode.allCases) { m in
                let active = mode == m
                Button {
                    if mode != m { Haptics.selection() }
                    mode = m
                } label: {
                    Text(m.label)
                        .font(.system(size: 14, weight: active ? .semibold : .medium))
                        .foregroundStyle(active ? Theme.Color.ink : Theme.Color.ink3)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(active ? Theme.Color.paper : .clear)
                                .shadow(color: active ? Color.black.opacity(0.08) : .clear,
                                        radius: 1.5, x: 0, y: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.cream)
        )
    }
}
