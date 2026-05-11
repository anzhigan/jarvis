import Foundation

// Pure helpers mirroring frontend/src/features/routines/lib/heatmap.ts.
// Keep behaviour 1-for-1 so the iOS card and the web card render the same
// streak / completion-rate / cell-state numbers.

enum RoutineHelpers {

    enum CellState {
        case done, partial, skipped, empty
    }

    static func cellState(of routine: Routine, entry: RoutineEntry?) -> CellState {
        guard let entry else { return .empty }
        if entry.value == 0 { return .skipped }
        if routine.kind == .numeric, let target = routine.targetValue, entry.value < target {
            return .partial
        }
        return .done
    }

    /// Current streak: consecutive completed days ending today (or yesterday
    /// if today is unfinished — same forgiving rule as the web side).
    static func currentStreak(_ routine: Routine) -> Int {
        let map = Dictionary(uniqueKeysWithValues: routine.entries.map { ($0.date, $0.value) })
        let today = Date()
        var count = 0
        for i in 0..<365 {
            guard let d = Calendar.current.date(byAdding: .day, value: -i, to: today) else { break }
            let key = APIDate(d)
            let v = map[key] ?? 0
            if v > 0 { count += 1 }
            else if i > 0 { break }     // first non-completed (other than today) breaks
            else { continue }            // today unfinished doesn't break
        }
        return count
    }

    /// Best ever streak across all entries.
    static func bestStreak(_ routine: Routine) -> Int {
        let dates = routine.entries.filter { $0.value > 0 }.map { $0.date }.sorted()
        guard !dates.isEmpty else { return 0 }
        var best = 1, cur = 1
        for i in 1..<dates.count {
            let prev = dates[i - 1].date()
            let here = dates[i].date()
            let diff = Calendar.current.dateComponents([.day], from: prev, to: here).day ?? 0
            if diff == 1 { cur += 1; if cur > best { best = cur } }
            else { cur = 1 }
        }
        return best
    }

    /// % of scheduled days completed in the last `windowDays`. 0…100.
    static func completionRate(_ routine: Routine, windowDays: Int = 30) -> Int {
        let map = Dictionary(uniqueKeysWithValues: routine.entries.map { ($0.date, $0.value) })
        let today = Date()
        var total = 0, done = 0
        for i in 0..<windowDays {
            guard let d = Calendar.current.date(byAdding: .day, value: -i, to: today) else { continue }
            if !isScheduledOn(routine, date: d) { continue }
            total += 1
            let key = APIDate(d)
            if (map[key] ?? 0) > 0 { done += 1 }
        }
        guard total > 0 else { return 0 }
        return Int((Double(done) / Double(total) * 100).rounded())
    }

    /// Whether a routine is scheduled on a given date.
    static func isScheduledOn(_ routine: Routine, date d: Date) -> Bool {
        if routine.isPaused { return false }
        let dKey = APIDate(d)
        if let s = routine.startDate, dKey < s { return false }
        if let e = routine.endDate,   e < dKey { return false }
        switch routine.scheduleType {
        case .daily:
            return true
        case .weeklyOnDays:
            let weekday = (Calendar.current.component(.weekday, from: d) - 1)   // 0=Sun..6=Sat
            let days = routine.scheduleDays
                .split(separator: ",")
                .compactMap { Int($0) }
            return days.contains(weekday)
        case .everyNDays:
            guard let start = routine.startDate else { return true }
            let delta = Calendar.current.dateComponents([.day], from: start.date(), to: d).day ?? 0
            let n = max(1, routine.scheduleNDays)
            return delta >= 0 && delta % n == 0
        case .timesPerWeek:
            return true   // every day is a candidate; rate enforces the cadence
        }
    }

    /// Today's classification used by the summary cells.
    enum TodayState { case notDue, pending, done, skipped }
    static func todayState(_ routine: Routine, today: Date = Date()) -> TodayState {
        if !isScheduledOn(routine, date: today) { return .notDue }
        let key = APIDate(today)
        let v = routine.entries.first(where: { $0.date == key })?.value
        if v == nil { return .pending }
        return (v! > 0) ? .done : .skipped
    }

    /// Plain-language schedule label.
    static func scheduleLabel(_ routine: Routine) -> String {
        switch routine.scheduleType {
        case .daily: return "Every day"
        case .weeklyOnDays:
            let names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            let parsed = routine.scheduleDays
                .split(separator: ",")
                .compactMap { Int($0) }
                .filter { (0...6).contains($0) }
            return parsed.isEmpty ? "Weekly" : parsed.map { names[$0] }.joined(separator: " · ")
        case .everyNDays:
            return "Every \(max(2, routine.scheduleNDays)) days"
        case .timesPerWeek:
            let p = routine.schedulePeriod == .week ? "week" : "month"
            return "\(routine.scheduleCountPerPeriod)× per \(p)"
        }
    }
}
