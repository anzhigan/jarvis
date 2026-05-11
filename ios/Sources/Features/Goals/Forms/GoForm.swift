import SwiftUI

// Go create/edit form. Optional parent (goal or step), boolean/numeric kind,
// numeric target + unit, optional period, color.

struct GoForm: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: GoalsViewModel
    let editing: Go?
    let initialTaskId: UUID?
    let initialStepId: UUID?

    @State private var title = ""
    @State private var description = ""
    @State private var kind: GoKind = .boolean
    @State private var unit = ""
    @State private var targetText = "1"
    @State private var hasStart = false
    @State private var hasDue   = false
    @State private var startDate: Date = Date()
    @State private var dueDate:   Date = Date().addingTimeInterval(7 * 86400)
    @State private var goalId: UUID? = nil
    @State private var stepId: UUID? = nil
    @State private var color = GoalPalette.default
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Title", text: $title) }

                Section("Kind") {
                    Picker("", selection: $kind) {
                        Text("Boolean").tag(GoKind.boolean)
                        Text("Numeric").tag(GoKind.numeric)
                    }
                    .pickerStyle(.segmented)
                    if kind == .numeric {
                        HStack {
                            TextField("Target", text: $targetText)
                                .keyboardType(.decimalPad)
                            Spacer()
                            TextField("unit (e.g. km)", text: $unit)
                                .frame(width: 140)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                }

                Section("Attached to") {
                    Picker("Goal", selection: $goalId) {
                        Text("(none)").tag(UUID?.none)
                        ForEach(vm.goals.filter { $0.status != .done }) { g in
                            Text(g.title).tag(UUID?.some(g.id))
                        }
                    }
                    Picker("Step", selection: $stepId) {
                        Text("(none)").tag(UUID?.none)
                        ForEach(stepsForGoal(goalId)) { s in
                            Text(s.title).tag(UUID?.some(s.id))
                        }
                    }
                }

                Section("Period") {
                    Toggle("Start date", isOn: $hasStart)
                    if hasStart {
                        DatePicker("", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                    Toggle("Due date", isOn: $hasDue)
                    if hasDue {
                        DatePicker("", selection: $dueDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                }
            }
            .navigationTitle(editing == nil ? "New go" : "Edit go")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Create" : "Save") {
                        Task { await submit() }
                    }
                    .disabled(busy || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear { initialize() }
        }
    }

    private func stepsForGoal(_ id: UUID?) -> [Step] {
        guard let id else { return [] }
        return vm.steps(forGoal: id)
    }

    private func initialize() {
        if let g = editing {
            title = g.title; description = g.description
            kind  = g.kind; unit = g.unit
            targetText = g.targetValue.map { stringify($0) } ?? "1"
            hasStart = g.startDate != nil; if let s = g.startDate { startDate = s.date() }
            hasDue   = g.dueDate   != nil; if let d = g.dueDate   { dueDate   = d.date() }
            goalId = g.taskId; stepId = g.stepId
            color = g.color
        } else {
            goalId = initialTaskId
            stepId = initialStepId
        }
    }

    private func submit() async {
        busy = true; defer { busy = false }
        let t = title.trimmingCharacters(in: .whitespaces)
        let target: Double? = kind == .numeric ? Double(targetText.replacingOccurrences(of: ",", with: ".")) : nil
        let s: APIDate? = hasStart ? APIDate(startDate) : nil
        let d: APIDate? = hasDue   ? APIDate(dueDate)   : nil
        if let g = editing {
            await vm.updateGo(id: g.id, GoPatch(
                title: t, description: description, kind: kind, unit: unit,
                targetValue: target, recurrence: nil, startDate: s, dueDate: d,
                color: color, taskId: goalId, stepId: stepId
            ))
        } else {
            await vm.createGo(GoCreate(
                title: t, description: description, kind: kind, unit: unit,
                targetValue: target, recurrence: .none,
                startDate: s, dueDate: d, color: color,
                taskId: goalId, stepId: stepId
            ))
        }
        dismiss()
    }

    private func stringify(_ d: Double) -> String {
        d == d.rounded() ? "\(Int(d))" : String(format: "%.1f", d)
    }
}
