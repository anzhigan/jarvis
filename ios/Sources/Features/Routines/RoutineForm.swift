import SwiftUI

// Create/edit a routine. Schedule editor switches based on the picked
// schedule type — same UI shape as the web RoutineForm.

struct RoutineForm: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var vm: RoutinesViewModel
    let editing: Routine?

    @State private var title = ""
    @State private var description = ""
    @State private var color = GoalPalette.swatches[2].hex   // Moss is the routine default
    @State private var goalId: UUID? = nil
    @State private var scheduleType: RoutineScheduleType = .daily
    @State private var weeklyDays: Set<Int> = [1, 3, 5]      // Mon/Wed/Fri default
    @State private var nDays: Int = 2
    @State private var timesPerPeriod: Int = 3
    @State private var period: RoutinePeriod = .week
    @State private var kind: RoutineKind = .boolean
    @State private var unit = ""
    @State private var targetText = "1"
    @State private var isPaused = false
    @State private var hasStart = false
    @State private var hasEnd   = false
    @State private var startDate = Date()
    @State private var endDate   = Date().addingTimeInterval(30 * 86400)
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Title", text: $title) }
                Section("Schedule") {
                    Picker("", selection: $scheduleType) {
                        Text("Daily").tag(RoutineScheduleType.daily)
                        Text("Weekly").tag(RoutineScheduleType.weeklyOnDays)
                        Text("Every N days").tag(RoutineScheduleType.everyNDays)
                        Text("Times per period").tag(RoutineScheduleType.timesPerWeek)
                    }
                    .pickerStyle(.segmented)
                    scheduleEditor
                }

                Section("Kind") {
                    Picker("", selection: $kind) {
                        Text("Boolean").tag(RoutineKind.boolean)
                        Text("Numeric").tag(RoutineKind.numeric)
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

                Section("Attached goal") {
                    Picker("Goal", selection: $goalId) {
                        Text("(none — standalone)").tag(UUID?.none)
                        ForEach(vm.goals.filter { $0.status != .done }) { g in
                            Text(g.title).tag(UUID?.some(g.id))
                        }
                    }
                }

                Section("Period") {
                    Toggle("Start date", isOn: $hasStart)
                    if hasStart {
                        DatePicker("", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                    Toggle("End date", isOn: $hasEnd)
                    if hasEnd {
                        DatePicker("", selection: $endDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                }

                if editing != nil {
                    Section { Toggle("Paused", isOn: $isPaused) }
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
                                            .strokeBorder(color == swatch.hex ? Theme.Color.ink : .clear,
                                                          lineWidth: 2)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .navigationTitle(editing == nil ? "New routine" : "Edit routine")
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

    @ViewBuilder
    private var scheduleEditor: some View {
        switch scheduleType {
        case .daily:
            EmptyView()
        case .weeklyOnDays:
            HStack(spacing: 6) {
                ForEach(0..<7) { d in
                    let label = ["S", "M", "T", "W", "T", "F", "S"][d]
                    let on = weeklyDays.contains(d)
                    Button {
                        if on { weeklyDays.remove(d) } else { weeklyDays.insert(d) }
                    } label: {
                        Text(label)
                            .font(Theme.Font.uiSmall)
                            .foregroundStyle(on ? .white : Theme.Color.ink3)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(on ? Theme.Color.indigo : Theme.Color.cream))
                    }
                    .buttonStyle(.plain)
                }
            }
        case .everyNDays:
            Stepper("Every \(nDays) day\(nDays == 1 ? "" : "s")", value: $nDays, in: 1...30)
        case .timesPerWeek:
            HStack {
                Stepper("\(timesPerPeriod)× per period", value: $timesPerPeriod, in: 1...20)
            }
            Picker("Period", selection: $period) {
                Text("Week").tag(RoutinePeriod.week)
                Text("Month").tag(RoutinePeriod.month)
            }.pickerStyle(.segmented)
        }
    }

    private func initialize() {
        guard let r = editing else { return }
        title = r.title; description = r.description; color = r.color
        goalId = r.goalId
        scheduleType = r.scheduleType
        weeklyDays = Set(r.scheduleDays.split(separator: ",").compactMap { Int($0) })
        nDays = max(1, r.scheduleNDays)
        timesPerPeriod = r.scheduleCountPerPeriod
        period = r.schedulePeriod
        kind = r.kind; unit = r.unit
        if let t = r.targetValue { targetText = t == t.rounded() ? "\(Int(t))" : String(format: "%.1f", t) }
        isPaused = r.isPaused
        if let s = r.startDate { hasStart = true; startDate = s.date() }
        if let e = r.endDate   { hasEnd = true;   endDate   = e.date() }
    }

    private func submit() async {
        busy = true; defer { busy = false }
        let t = title.trimmingCharacters(in: .whitespaces)
        let scheduleDays = weeklyDays.sorted().map(String.init).joined(separator: ",")
        let target: Double? = kind == .numeric ? Double(targetText.replacingOccurrences(of: ",", with: ".")) : nil
        let s: APIDate? = hasStart ? APIDate(startDate) : nil
        let e: APIDate? = hasEnd   ? APIDate(endDate)   : nil

        if let r = editing {
            await vm.update(id: r.id, RoutinePatch(
                title: t, description: description, color: color,
                goalId: goalId, stepId: nil,
                scheduleType: scheduleType, scheduleDays: scheduleDays,
                scheduleNDays: nDays, scheduleCountPerPeriod: timesPerPeriod, schedulePeriod: period,
                startDate: s, endDate: e, isPaused: isPaused,
                kind: kind, unit: unit, targetValue: target
            ))
        } else {
            await vm.create(RoutineCreate(
                title: t, description: description, color: color,
                goalId: goalId, stepId: nil,
                scheduleType: scheduleType, scheduleDays: scheduleDays,
                scheduleNDays: nDays, scheduleCountPerPeriod: timesPerPeriod, schedulePeriod: period,
                startDate: s, endDate: e, isPaused: false,
                kind: kind, unit: unit, targetValue: target
            ))
        }
        dismiss()
    }
}
