import SwiftUI

// Goal create/edit sheet. Same shape on both: title + description + status +
// priority + start/due + colour swatches. Editing mode pre-fills from the
// existing goal and patches; create mode posts a new goal.

struct GoalForm: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: GoalsViewModel
    let editing: Goal?

    @State private var title = ""
    @State private var description = ""
    @State private var status: TaskStatus = .active
    @State private var priority: TaskPriority = .medium
    @State private var hasStart = false
    @State private var hasDue   = false
    @State private var startDate: Date = Date()
    @State private var dueDate:   Date = Date().addingTimeInterval(7 * 86400)
    @State private var color = GoalPalette.default
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Title", text: $title)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                }

                Section("Status") {
                    Picker("", selection: $status) {
                        ForEach(TaskStatus.allCases, id: \.self) {
                            Text($0.displayName).tag($0)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Priority") {
                    Picker("", selection: $priority) {
                        Text("Low").tag(TaskPriority.low)
                        Text("Medium").tag(TaskPriority.medium)
                        Text("High").tag(TaskPriority.high)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Dates") {
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

                Section("Color") {
                    HStack(spacing: 10) {
                        ForEach(GoalPalette.swatches) { swatch in
                            let c = GoalPalette.color(forHex: swatch.hex)
                            Button {
                                color = swatch.hex
                            } label: {
                                Circle()
                                    .fill(c)
                                    .frame(width: 30, height: 30)
                                    .overlay(
                                        Circle()
                                            .strokeBorder(color == swatch.hex
                                                          ? Theme.Color.ink
                                                          : .clear, lineWidth: 2)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle(editing == nil ? "New goal" : "Edit goal")
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
        guard let g = editing else { return }
        title       = g.title
        description = g.description
        status      = g.status
        priority    = g.priority
        hasStart    = g.startDate != nil
        hasDue      = g.dueDate   != nil
        if let s = g.startDate { startDate = s.date() }
        if let d = g.dueDate   { dueDate   = d.date() }
        color       = g.color
    }

    private func submit() async {
        busy = true
        defer { busy = false }
        let trimmedTitle = title.trimmingCharacters(in: .whitespaces)
        let s: APIDate? = hasStart ? APIDate(startDate) : nil
        let d: APIDate? = hasDue   ? APIDate(dueDate)   : nil
        if let g = editing {
            await vm.updateGoal(id: g.id, GoalPatch(
                title: trimmedTitle, description: description,
                status: status, priority: priority,
                startDate: s, dueDate: d,
                isCompleted: nil, order: nil, color: color
            ))
        } else {
            await vm.createGoal(GoalCreate(
                title: trimmedTitle, description: description,
                status: status, priority: priority,
                startDate: s, dueDate: d,
                order: vm.goals.count, color: color, tagIds: []
            ))
        }
        dismiss()
    }
}
