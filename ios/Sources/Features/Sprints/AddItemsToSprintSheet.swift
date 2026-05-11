import SwiftUI

// Focused sheet for attaching existing entities to a Sprint. Same shape as
// the web mobile picker flow: four "+ Goal / + Step / + Go / + Routine"
// buttons → each opens a multi-select picker → selected items appear as
// chips below → "Add N" submits.

struct AddItemsToSprintSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: SprintsViewModel
    let sprint: Sprint

    @State private var attachGoals    = Set<UUID>()
    @State private var attachSteps    = Set<UUID>()
    @State private var attachGos      = Set<UUID>()
    @State private var attachRoutines = Set<UUID>()
    @State private var openPicker: PickerKind? = nil
    @State private var busy = false

    enum PickerKind: String, Identifiable { case goal, step, go, routine
        var id: String { rawValue }
    }

    private var existingIds: (goal: Set<UUID>, step: Set<UUID>, go: Set<UUID>, routine: Set<UUID>) {
        var g = Set<UUID>(), s = Set<UUID>(), o = Set<UUID>(), r = Set<UUID>()
        for it in sprint.items {
            switch it.itemType {
            case .goal:    if let id = it.goalId    { g.insert(id) }
            case .step:    if let id = it.stepId    { s.insert(id) }
            case .go:      if let id = it.goId      { o.insert(id) }
            case .routine: if let id = it.routineId { r.insert(id) }
            }
        }
        return (g, s, o, r)
    }

    private var totalSelected: Int {
        attachGoals.count + attachSteps.count + attachGos.count + attachRoutines.count
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Attach existing items to \"\(sprint.title)\".")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.ink4)
                    HStack(spacing: 10) {
                        attachButton(.goal,    label: "Goal",    count: attachGoals.count)
                        attachButton(.step,    label: "Step",    count: attachSteps.count)
                    }
                    HStack(spacing: 10) {
                        attachButton(.go,      label: "Go",      count: attachGos.count)
                        attachButton(.routine, label: "Routine", count: attachRoutines.count)
                    }
                    if totalSelected > 0 {
                        chipsRow.padding(.top, 4)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Add items")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(totalSelected > 0 ? "Add \(totalSelected)" : "Add") {
                        Task { await submit() }
                    }
                    .disabled(busy || totalSelected == 0)
                }
            }
            .sheet(item: $openPicker) { kind in
                pickerSheet(for: kind)
            }
        }
    }

    private func attachButton(_ kind: PickerKind, label: String, count: Int) -> some View {
        Button { openPicker = kind } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 13, weight: .semibold))
                Text(label).font(.system(size: 14, weight: .medium))
                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(Capsule().fill(Theme.Color.indigo))
                }
            }
            .foregroundStyle(Theme.Color.ink3)
            .frame(maxWidth: .infinity).frame(height: 44)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                    .foregroundStyle(Theme.Color.hairlineStrong)
            )
        }
        .buttonStyle(.plain)
    }

    private var chipsRow: some View {
        FlowLayout(spacing: 6) {
            ForEach(vm.goals.filter { attachGoals.contains($0.id) }) { g in
                chip("Goal · \(g.title)") { attachGoals.remove(g.id) }
            }
            ForEach(vm.steps.filter { attachSteps.contains($0.id) }) { s in
                chip("Step · \(s.title)") { attachSteps.remove(s.id) }
            }
            ForEach(vm.gos.filter { attachGos.contains($0.id) }) { g in
                chip("Go · \(g.title)") { attachGos.remove(g.id) }
            }
            ForEach(vm.routines.filter { attachRoutines.contains($0.id) }) { r in
                chip("Routine · \(r.title)") { attachRoutines.remove(r.id) }
            }
        }
    }

    private func chip(_ text: String, onRemove: @escaping () -> Void) -> some View {
        HStack(spacing: 6) {
            Text(text).font(.system(size: 12, weight: .medium))
            Button(action: onRemove) {
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
            }
            .buttonStyle(.plain)
        }
        .foregroundStyle(Theme.Color.ink3)
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Capsule().fill(Theme.Color.cream))
    }

    @ViewBuilder
    private func pickerSheet(for kind: PickerKind) -> some View {
        let existing = existingIds
        switch kind {
        case .goal:
            PickerListSheet(
                title: "Pick a goal",
                items: vm.goals.filter { !existing.goal.contains($0.id) }
                    .map { ($0.id, $0.title, GoalPalette.color(forHex: $0.color)) },
                selected: $attachGoals
            )
        case .step:
            PickerListSheet(
                title: "Pick a step",
                items: vm.steps.filter { !existing.step.contains($0.id) }
                    .map { ($0.id, "\($0.title) — \(vm.goalsById[$0.taskId]?.title ?? "")", Theme.Color.ochre) },
                selected: $attachSteps
            )
        case .go:
            PickerListSheet(
                title: "Pick a go",
                items: vm.gos.filter { !existing.go.contains($0.id) }
                    .map { ($0.id, $0.title, Theme.Color.rust) },
                selected: $attachGos
            )
        case .routine:
            PickerListSheet(
                title: "Pick a routine",
                items: vm.routines.filter { !existing.routine.contains($0.id) }
                    .map { ($0.id, $0.title, Theme.Color.slate) },
                selected: $attachRoutines
            )
        }
    }

    private func submit() async {
        busy = true; defer { busy = false }
        var items: [SprintItemAdd] = []
        items += attachGoals.map { SprintItemAdd(itemType: .goal,    goalId: $0,   stepId: nil, goId: nil, routineId: nil) }
        items += attachSteps.map { SprintItemAdd(itemType: .step,    goalId: nil,  stepId: $0,  goId: nil, routineId: nil) }
        items += attachGos.map   { SprintItemAdd(itemType: .go,      goalId: nil,  stepId: nil, goId: $0,  routineId: nil) }
        items += attachRoutines.map { SprintItemAdd(itemType: .routine, goalId: nil, stepId: nil, goId: nil, routineId: $0) }
        for item in items {
            await vm.addItem(sprintId: sprint.id, item)
        }
        dismiss()
    }
}

// MARK: - PickerListSheet

private struct PickerListSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let items: [(UUID, String, Color)]
    @Binding var selected: Set<UUID>
    @State private var query: String = ""

    private var filtered: [(UUID, String, Color)] {
        guard !query.isEmpty else { return items }
        let q = query.lowercased()
        return items.filter { $0.1.lowercased().contains(q) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                SearchPill(placeholder: "Search…", text: $query)
                    .padding(.horizontal, 16).padding(.top, 12)
                if filtered.isEmpty {
                    Text(query.isEmpty ? "Nothing to attach." : "No matches.")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.Color.ink5)
                        .padding(.top, 60)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(filtered, id: \.0) { id, label, color in
                                row(id: id, label: label, color: color)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                Spacer()
            }
            .background(Theme.Color.paper.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(selected.isEmpty ? "Done" : "Add \(selected.count)") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func row(id: UUID, label: String, color: Color) -> some View {
        let on = selected.contains(id)
        return Button {
            if on { selected.remove(id) } else { selected.insert(id) }
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(on ? Theme.Color.indigo : Theme.Color.hairlineStrong, lineWidth: 1.5)
                        .frame(width: 20, height: 20)
                    if on {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Theme.Color.indigo)
                            .frame(width: 20, height: 20)
                        Image(systemName: "checkmark").font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
                Text(label)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.Color.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(on ? Theme.Color.indigo.opacity(0.08) : Theme.Color.paper)
                    .stroke(on ? Theme.Color.indigo : Theme.Color.hairlineStrong, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - FlowLayout (multi-line wrapping HStack)

struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let max = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > max && x > 0 { x = 0; y += lineH + spacing; lineH = 0 }
            x += s.width + spacing
            lineH = Swift.max(lineH, s.height)
        }
        return CGSize(width: max == .infinity ? x : max, height: y + lineH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX, y: CGFloat = bounds.minY, lineH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX && x > bounds.minX {
                x = bounds.minX; y += lineH + spacing; lineH = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            lineH = Swift.max(lineH, s.height)
        }
    }
}
