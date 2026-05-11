import SwiftUI

// Step view — flat list of all steps from active goals as constellation
// cards, grouped silently by parent goal (no headers any more, per the
// web-side design pass). Each StepCard shows: title + period header,
// constellation of go-nodes, status pill + days-left footer.

struct StepView: View {
    @ObservedObject var vm: GoalsViewModel
    let onCreateStep: () -> Void
    let onEditStep: (Step) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                AddButton(label: "Step", action: onCreateStep)
                    .padding(.bottom, 4)

                if visibleSteps.isEmpty && !vm.isLoading {
                    Text("No steps yet")
                        .font(.system(size: 18, weight: .medium, design: .serif))
                        .foregroundStyle(Theme.Color.ink3)
                        .padding(.top, 60)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(visibleSteps) { step in
                        if let parent = vm.goal(step.taskId) {
                            SwipeRow(
                                onEdit: { onEditStep(step) },
                                onDelete: { Task { await vm.deleteStep(step.id) } },
                                onTap: nil
                            ) {
                                StepCard(
                                    step: step,
                                    parent: parent,
                                    onToggleGoDone: { go in Task { await vm.toggleDoneToday(go) } },
                                    onTapEdit:    { onEditStep(step) },
                                    onTapDelete:  { Task { await vm.deleteStep(step.id) } }
                                )
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(Theme.Color.paper.ignoresSafeArea())
        .refreshable { await vm.load() }
    }

    private var visibleSteps: [Step] {
        // Hide steps whose parent goal is already done.
        vm.steps.filter { step in
            guard let goal = vm.goal(step.taskId) else { return false }
            return goal.status != .done
        }
        .sorted { $0.startDate < $1.startDate }
    }
}
