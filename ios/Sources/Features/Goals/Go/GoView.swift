import SwiftUI

// Go view = today's targets. Day filter (past/today/future), big TgCards
// for each go with attach pill + period, numeric stepper or boolean toggle,
// progress bar + status footer. Tap-and-go logging.

struct GoView: View {
    @ObservedObject var vm: GoalsViewModel
    @State private var dayFilter: DayFilter = .today
    let onCreateGo: () -> Void
    let onEditGo: (Go) -> Void

    enum DayFilter: String, CaseIterable, Identifiable {
        case past, today, future
        var id: Self { self }
        var label: String { rawValue.capitalized }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 12) {
                    timePills
                    AddButton(label: "Go", action: onCreateGo)
                }
                .padding(.bottom, 4)

                if filtered.isEmpty && !vm.isLoading {
                    Text("Nothing to log here.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.ink5)
                        .padding(.top, 40)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(filtered) { go in
                        SwipeRow(
                            onEdit: { onEditGo(go) },
                            onDelete: { Task { await vm.deleteGo(go.id) } },
                            onTap: nil
                        ) {
                            TgCard(
                                go: go,
                                parent: parentLabel(for: go),
                                onLog: { value in Task { await vm.logToday(go, value: value) } },
                                onTapEdit:   { onEditGo(go) },
                                onTapDelete: { Task { await vm.deleteGo(go.id) } }
                            )
                        }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(Theme.Color.paper.ignoresSafeArea())
        .refreshable { await vm.load() }
    }

    private var timePills: some View {
        HStack(spacing: 6) {
            ForEach(DayFilter.allCases) { f in
                Button { dayFilter = f } label: {
                    Text(f.label)
                        .font(Theme.Font.uiSmall)
                        .foregroundStyle(dayFilter == f ? .white : Theme.Color.ink3)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(
                            Capsule().fill(dayFilter == f ? Theme.Color.indigo : Theme.Color.cream)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var filtered: [Go] {
        let today = APIDate.today()
        return vm.gos.filter { go in
            switch dayFilter {
            case .past:   return go.dueDate.map { $0 < today } ?? false
            case .future: return go.dueDate.map { $0 > today } ?? false
            case .today:
                if let due = go.dueDate { return due == today || go.isDoneToday }
                return true   // no deadline → show in today's bucket
            }
        }
    }

    /// "Step · X" if attached to a step, else "Goal · Y", else "Standalone".
    private func parentLabel(for go: Go) -> (text: String, color: Color, isStep: Bool) {
        if let stepId = go.stepId, let step = vm.step(stepId) {
            // Step.taskId is non-optional (Step always belongs to a Goal),
            // so a direct lookup suffices.
            let parent = vm.goal(step.taskId)
            let color = parent.map { GoalPalette.color(forHex: $0.color) } ?? Theme.Color.ink4
            return ("Step · \(step.title)", color, true)
        }
        if let goalId = go.taskId, let goal = vm.goal(goalId) {
            return ("Goal · \(goal.title)", GoalPalette.color(forHex: goal.color), false)
        }
        return ("Standalone", Theme.Color.ink5, false)
    }
}
