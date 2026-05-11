import Foundation
import SwiftUI

// 1-for-1 port of MobileAnalysisScreen.tsx aggregations. Loads goals/gos/
// routines/notes from the repos in parallel, then computes the same KPI /
// series / donut / heatmap shapes the web side renders.

@MainActor
final class AnalysisViewModel: ObservableObject {

    enum Period: String, CaseIterable, Identifiable {
        case d7 = "7d", d30 = "30d", d90 = "90d", y1 = "1y"
        var id: String { rawValue }
        var days: Int {
            switch self { case .d7: return 7; case .d30: return 30; case .d90: return 90; case .y1: return 365 }
        }
    }

    // MARK: - State

    @Published private(set) var goals:    [Goal]    = []
    @Published private(set) var gos:      [Go]      = []
    @Published private(set) var routines: [Routine] = []
    @Published private(set) var ways:     [Way]     = []
    @Published private(set) var isLoading = false
    @Published var error: String? = nil
    @Published var period: Period = .d30 {
        didSet { recomputeAll() }
    }

    // Cached derived shapes. Recomputed once per data refresh (load() or
    // period change) instead of on every view body re-render. The analysis
    // tab has six heavy computed series that previously ran on each tick
    // of `isLoading`, period pill animation, etc. Caching cut its body
    // re-render cost from ~30ms to ~1ms.
    @Published private(set) var kpi: KPI = KPI(onTrackPct: 0, advancing: 0, longest: 0, notesAdded: 0)
    @Published private(set) var series: Series = Series(dates: [], routinePoints: [], goPoints: [], routinesAvg: 0, goAvg: 0)
    @Published private(set) var goalBars: [GoalBar] = []
    @Published private(set) var statusBuckets: StatusBuckets = StatusBuckets(strong: 0, active: 0, slipping: 0, hold: 0, total: 0)
    @Published private(set) var topStreaks: [StreakRow] = []
    @Published private(set) var yearHeat: YearHeat = YearHeat(weeks: [], totalEntries: 0, pctActive: 0)

    private let repos: Repositories
    init(repos: Repositories) { self.repos = repos }

    func load() async {
        isLoading = true; defer { isLoading = false }
        do {
            async let g  = repos.goals.listGoals()
            async let go = repos.gos.listGos()
            async let r  = repos.routines.listRoutines()
            async let w  = repos.notes.listWays()
            self.goals    = try await g
            self.gos      = try await go
            self.routines = try await r
            self.ways     = try await w
            recomputeAll()
        } catch let err {
            self.error = (err as NSError).localizedDescription
        }
    }

    private func recomputeAll() {
        kpi = computeKPI()
        series = computeSeries()
        goalBars = computeGoalBars()
        statusBuckets = computeStatusBuckets()
        topStreaks = computeTopStreaks()
        yearHeat = computeYearHeat()
    }

    // MARK: - Derived

    /// All notes across ways (direct children + topic children).
    private var allNotes: [Note] {
        var out: [Note] = []
        for way in ways {
            out.append(contentsOf: way.notes)
            for t in way.topics { out.append(contentsOf: t.notes) }
        }
        return out
    }

    private var today: Date { Calendar.current.startOfDay(for: Date()) }

    private var cutoffDate: Date {
        Calendar.current.date(byAdding: .day, value: -(period.days - 1), to: today) ?? today
    }

    struct KPI {
        let onTrackPct: Int
        let advancing: Int
        let longest: Int
        let notesAdded: Int
    }

    private func computeKPI() -> KPI {
        let active = routines.filter { !$0.isPaused }
        let onTrack = active.isEmpty ? 0
            : Int((active.map { Double(RoutineHelpers.completionRate($0, windowDays: period.days)) }
                .reduce(0, +) / Double(active.count)).rounded())
        let advancing = goals.filter { $0.status == .active && $0.progress > 0 }.count
        let longest   = routines.map(RoutineHelpers.currentStreak).max() ?? 0
        let cutoff    = cutoffDate
        let added     = allNotes.filter { $0.createdAt >= cutoff }.count
        return KPI(onTrackPct: onTrack, advancing: advancing, longest: longest, notesAdded: added)
    }

    struct Series {
        let dates:  [APIDate]
        let routinePoints: [Int]
        let goPoints:      [Int]
        let routinesAvg: Int
        let goAvg:       Int
    }

    /// Daily completion percentages for both routines (daily-only) and gos.
    /// Pre-builds per-routine and per-go date→value dictionaries so the
    /// inner loop is O(1) lookup instead of O(entries) — at ~30-day window
    /// across dozens of routines that cuts the computation from quadratic
    /// to linear in routine count.
    private func computeSeries() -> Series {
        let cal = Calendar.current
        var dates: [APIDate] = []
        let n = period.days
        for i in stride(from: n - 1, through: 0, by: -1) {
            if let d = cal.date(byAdding: .day, value: -i, to: today) {
                dates.append(APIDate(d))
            }
        }
        // Pre-index every active routine's entries and every go's entries
        // by date for O(1) per-day lookups below.
        struct Idx { let dailyRoutines: [[APIDate: Double]]; let gos: [[APIDate: Double]] }
        let activeDailyRoutineMaps: [[APIDate: Double]] = routines
            .filter { !$0.isPaused && $0.scheduleType == .daily }
            .map { Dictionary(uniqueKeysWithValues: $0.entries.map { ($0.date, $0.value) }) }
        let goMaps: [[APIDate: Double]] = gos
            .map { Dictionary(uniqueKeysWithValues: $0.entries.map { ($0.date, $0.value) }) }

        var rPoints: [Int] = []; rPoints.reserveCapacity(dates.count)
        var gPoints: [Int] = []; gPoints.reserveCapacity(dates.count)
        for date in dates {
            // Routines: % of scheduled (== daily-active) that have value>0
            let totalRoutines = activeDailyRoutineMaps.count
            if totalRoutines == 0 {
                rPoints.append(0)
            } else {
                var done = 0
                for m in activeDailyRoutineMaps where (m[date] ?? 0) > 0 { done += 1 }
                rPoints.append(Int((Double(done) / Double(totalRoutines) * 100).rounded()))
            }
            // Gos: % of go-entries on this date with value>0
            var goTotal = 0, goHit = 0
            for m in goMaps {
                if let v = m[date] {
                    goTotal += 1
                    if v > 0 { goHit += 1 }
                }
            }
            gPoints.append(goTotal == 0 ? 0 : Int((Double(goHit) / Double(goTotal) * 100).rounded()))
        }
        let avg: ([Int]) -> Int = { arr in
            arr.isEmpty ? 0 : Int((Double(arr.reduce(0, +)) / Double(arr.count)).rounded())
        }
        return Series(dates: dates, routinePoints: rPoints, goPoints: gPoints,
                      routinesAvg: avg(rPoints), goAvg: avg(gPoints))
    }

    struct GoalBar: Identifiable {
        let id: UUID
        let title: String
        let pct: Int
        let expected: Int?
        let color: Color
    }

    /// Up to 5 active/paused goals with their actual vs expected progress.
    private func computeGoalBars() -> [GoalBar] {
        let palette: [Color] = [Theme.Color.moss, Theme.Color.indigo, Theme.Color.ochre, Theme.Color.rust, Theme.Color.slate]
        let now = today.timeIntervalSince1970
        return goals
            .filter { $0.status == .active || $0.status == .paused }
            .prefix(5)
            .enumerated()
            .map { (i, t) -> GoalBar in
                var expected: Int? = nil
                if let s = t.startDate, let e = t.dueDate {
                    let start = s.date().timeIntervalSince1970
                    let end   = e.date().timeIntervalSince1970
                    if end > start {
                        expected = max(0, min(100, Int(((now - start) / (end - start) * 100).rounded())))
                    }
                }
                let color: Color = t.color.isEmpty
                    ? palette[i % palette.count]
                    : GoalPalette.color(forHex: t.color)
                return GoalBar(id: t.id, title: t.title, pct: t.progress, expected: expected, color: color)
            }
    }

    struct StatusBuckets { let strong, active, slipping, hold, total: Int }

    private func computeStatusBuckets() -> StatusBuckets {
        var strong = 0, active = 0, slipping = 0, hold = 0
        for r in routines {
            if r.isPaused { hold += 1; continue }
            let rate   = RoutineHelpers.completionRate(r, windowDays: 30)
            let streak = RoutineHelpers.currentStreak(r)
            if streak >= 7 && rate >= 80 { strong += 1 }
            else if rate < 50            { slipping += 1 }
            else                          { active += 1 }
        }
        return StatusBuckets(strong: strong, active: active, slipping: slipping, hold: hold,
                             total: routines.count)
    }

    struct StreakRow: Identifiable {
        let id: UUID
        let title: String
        let streak: Int
        let lastN: [Double]
    }

    /// Top 4 routines by current streak, with last-13-day spark values.
    private func computeTopStreaks() -> [StreakRow] {
        routines
            .map { r -> StreakRow in
                let s = RoutineHelpers.currentStreak(r)
                return StreakRow(id: r.id, title: r.title, streak: s, lastN: lastNValues(r.entries, n: 13))
            }
            .filter { $0.streak > 0 }
            .sorted { $0.streak > $1.streak }
            .prefix(4)
            .map { $0 }
    }

    private func lastNValues(_ entries: [RoutineEntry], n: Int) -> [Double] {
        let map = Dictionary(uniqueKeysWithValues: entries.map { ($0.date, $0.value) })
        var out: [Double] = []
        let cal = Calendar.current
        for i in stride(from: n - 1, through: 0, by: -1) {
            if let d = cal.date(byAdding: .day, value: -i, to: today) {
                out.append(map[APIDate(d)] ?? 0)
            }
        }
        return out
    }

    struct YearHeat {
        struct Cell: Identifiable {
            let id = UUID()
            let date: APIDate
            let level: Int    // 0…4
            let isToday: Bool
        }
        let weeks: [[Cell]]   // 53 weeks × 7 days
        let totalEntries: Int
        let pctActive: Int
    }

    private func computeYearHeat() -> YearHeat {
        // Aggregate counts per date across routines + gos (positive values only).
        var counts: [APIDate: Int] = [:]
        for r in routines { for e in r.entries where e.value > 0 { counts[e.date, default: 0] += 1 } }
        for g in gos      { for e in g.entries where e.value > 0 { counts[e.date, default: 0] += 1 } }

        var weeks: [[YearHeat.Cell]] = []
        let cal = Calendar.current
        guard var start = cal.date(byAdding: .day, value: -364, to: today) else {
            return YearHeat(weeks: [], totalEntries: 0, pctActive: 0)
        }
        // Align to the start of the week (Sunday = 1 in Apple's calendar).
        let dow = (cal.component(.weekday, from: start) - 1)
        start = cal.date(byAdding: .day, value: -dow, to: start) ?? start
        let todayKey = APIDate(today)
        for w in 0..<53 {
            var week: [YearHeat.Cell] = []
            for d in 0..<7 {
                guard let cur = cal.date(byAdding: .day, value: w * 7 + d, to: start) else { continue }
                let key = APIDate(cur)
                let val = counts[key] ?? 0
                let level: Int = val == 0 ? 0 : val < 2 ? 1 : val < 4 ? 2 : val < 7 ? 3 : 4
                week.append(.init(date: key, level: level, isToday: key == todayKey))
            }
            weeks.append(week)
        }
        let totalEntries = counts.values.reduce(0, +)
        let activeDays   = counts.count
        let pctActive    = Int((Double(activeDays) / 365.0 * 100).rounded())
        return YearHeat(weeks: weeks, totalEntries: totalEntries, pctActive: pctActive)
    }

    /// "May, 2026, in figures" eyebrow.
    var eyebrowLabel: String {
        let f = DateFormatter(); f.dateFormat = "LLLL yyyy"
        return "\(f.string(from: today)), in figures"
    }

    /// 2-line headline depending on the period summary.
    var headline: (line1: String, line2Leading: String, line2Em: String, line2Trailing: String) {
        let onTrack = kpi.onTrackPct
        let slipping = statusBuckets.slipping
        if onTrack >= 80 {
            return ("A solid month,", "everything ", "on track", ".")
        }
        if slipping > 0 {
            return ("Mostly steady,", "with ", "\(slipping) slipping", ".")
        }
        if onTrack < 40 {
            return ("A quiet month,", "time to ", "rebuild", ".")
        }
        return ("A balanced", "", "period", ".")
    }
}
