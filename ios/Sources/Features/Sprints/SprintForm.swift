import SwiftUI

// Create / edit a Sprint. Title, description, start/end (required), color
// from the shared GoalPalette.

struct SprintForm: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: SprintsViewModel
    let editing: Sprint?

    @State private var title = ""
    @State private var description = ""
    @State private var startDate: Date = Date()
    @State private var endDate:   Date = Date().addingTimeInterval(21 * 86400)
    @State private var color = GoalPalette.default
    @State private var isArchived = false
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(1...4)
                }
                Section("Period") {
                    DatePicker("Start", selection: $startDate, displayedComponents: .date)
                    DatePicker("End",   selection: $endDate, in: startDate...,
                               displayedComponents: .date)
                }
                Section("Color") {
                    HStack(spacing: 10) {
                        ForEach(GoalPalette.swatches) { s in
                            let c = GoalPalette.color(forHex: s.hex)
                            Button {
                                color = s.hex
                            } label: {
                                Circle().fill(c).frame(width: 30, height: 30)
                                    .overlay(
                                        Circle().strokeBorder(color == s.hex ? Theme.Color.ink : .clear,
                                                              lineWidth: 2)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if editing != nil {
                    Section { Toggle("Archived", isOn: $isArchived) }
                }
            }
            .navigationTitle(editing == nil ? "New sprint" : "Edit sprint")
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

    private func initialize() {
        guard let s = editing else { return }
        title = s.title; description = s.description; color = s.color
        startDate = s.startDate.date(); endDate = s.endDate.date()
        isArchived = s.isArchived
    }

    private func submit() async {
        busy = true; defer { busy = false }
        let t = title.trimmingCharacters(in: .whitespaces)
        if let s = editing {
            await vm.updateSprint(id: s.id, SprintPatch(
                title: t, description: description,
                startDate: APIDate(startDate), endDate: APIDate(endDate),
                color: color, isArchived: isArchived
            ))
        } else {
            await vm.createSprint(SprintCreate(
                title: t, description: description,
                startDate: APIDate(startDate), endDate: APIDate(endDate),
                color: color
            ))
        }
        dismiss()
    }
}
