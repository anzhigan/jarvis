import SwiftUI

// Step create/edit form. Step always has a parent goal — picker shows
// non-done goals. Title, description, start/end (required), color.

struct StepForm: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: GoalsViewModel
    let editing: Step?
    let initialGoalId: UUID?

    @State private var title = ""
    @State private var description = ""
    @State private var goalId: UUID? = nil
    @State private var startDate: Date = Date()
    @State private var endDate:   Date = Date().addingTimeInterval(14 * 86400)
    @State private var isCompleted = false
    @State private var color = GoalPalette.default
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(1...5)
                }
                Section("Parent goal") {
                    Picker("Goal", selection: $goalId) {
                        Text("(none)").tag(UUID?.none)
                        ForEach(vm.goals.filter { $0.status != .done }) { g in
                            Text(g.title).tag(UUID?.some(g.id))
                        }
                    }
                }
                Section("Period") {
                    DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    DatePicker("End",   selection: $endDate,   in: startDate...,
                                displayedComponents: .date)
                }
                if editing != nil {
                    Section { Toggle("Completed", isOn: $isCompleted) }
                }
            }
            .navigationTitle(editing == nil ? "New step" : "Edit step")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing == nil ? "Create" : "Save") {
                        Task { await submit() }
                    }
                    .disabled(busy || !canSubmit)
                }
            }
            .onAppear { initialize() }
        }
    }

    private var canSubmit: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && goalId != nil
    }

    private func initialize() {
        if let s = editing {
            title = s.title
            description = s.description
            goalId = s.taskId
            startDate = s.startDate.date()
            endDate   = s.endDate.date()
            isCompleted = s.isCompleted
            color = s.color
        } else if let id = initialGoalId {
            goalId = id
        } else {
            goalId = vm.goals.first(where: { $0.status != .done })?.id
        }
    }

    private func submit() async {
        guard let goalId else { return }
        busy = true; defer { busy = false }
        let t = title.trimmingCharacters(in: .whitespaces)
        if let s = editing {
            await vm.updateStep(id: s.id, StepPatch(
                title: t, description: description,
                startDate: APIDate(startDate), endDate: APIDate(endDate),
                isCompleted: isCompleted, color: color, taskId: goalId
            ))
        } else {
            await vm.createStep(StepCreate(
                taskId: goalId, title: t, description: description,
                startDate: APIDate(startDate), endDate: APIDate(endDate),
                color: color
            ))
        }
        dismiss()
    }
}
