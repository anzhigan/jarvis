import SwiftUI
import Charts

// 1-for-1 port of MobileAnalysisScreen.tsx layout. Sections, in order:
//   1. Editorial hero (eyebrow + 2-line headline with italic emphasis)
//   2. KPI grid (4 tiles)
//   3. Time period pills (7d/30d/90d/1y)
//   4. Daily completion area chart (routines vs gos)
//   5. Goals vs plan horizontal bar chart
//   6. Routines by status donut + legend rows
//   7. Top streaks list with sparkline
//   8. Year-of-practice heatmap (53×7 grid)

struct AnalysisTabRoot: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var repos: Repositories
    @StateObject private var vm: AnalysisViewModel

    init(repos: Repositories) {
        _vm = StateObject(wrappedValue: AnalysisViewModel(repos: repos))
    }

    private var avatarInitial: String {
        auth.currentUser?.username.first.map { String($0) } ?? "?"
    }

    var body: some View {
        VStack(spacing: 0) {
            MobileTopBar(
                title: "Analysis",
                subtitle: "\(vm.kpi.advancing) goals advancing · \(vm.kpi.onTrackPct)% on track",
                avatarInitial: avatarInitial
            )

            if vm.isLoading && vm.goals.isEmpty {
                Spacer()
                ProgressView().tint(Theme.Color.indigo)
                Spacer()
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        editorialHero
                        kpiGrid
                        periodPills
                        dailyCompletionCard
                        if !vm.goalBars.isEmpty { goalsVsPlanCard }
                        statusDonutCard
                        if !vm.topStreaks.isEmpty { topStreaksCard }
                        yearHeatmapCard
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                }
                .refreshable { await vm.load() }
            }
        }
        .background(Theme.Color.paper.ignoresSafeArea())
        .task { if vm.goals.isEmpty { await vm.load() } }
        .alert(
            "Something went wrong",
            isPresented: Binding(get: { vm.error != nil }, set: { if !$0 { vm.error = nil } }),
            presenting: vm.error
        ) { _ in
            Button("OK") { vm.error = nil }
        } message: { msg in Text(msg) }
    }

    // MARK: - Hero

    // CSS .ana-hero / .ana-eyebrow / .ana-hero-title — large editorial intro
    // with mono uppercase eyebrow and a 2-line Fraunces headline.
    private var editorialHero: some View {
        let h = vm.headline
        return VStack(alignment: .leading, spacing: 6) {
            Text(vm.eyebrowLabel.uppercased())
                .font(.system(size: 10, weight: .medium))
                .tracking(1.0)
                .foregroundStyle(Theme.Color.ink5)
            VStack(alignment: .leading, spacing: 0) {
                Text(h.line1)
                Text(h.line2Leading)
                    + Text(h.line2Em).italic()
                    + Text(h.line2Trailing)
            }
            .font(.system(size: 28, weight: .medium, design: .serif))
            .tracking(-0.6)
            .foregroundStyle(Theme.Color.ink)
            .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
        .padding(.bottom, 4)
    }

    // MARK: - KPI grid

    // CSS .kpi-grid: 2-col grid, gap 8. Tile padding 14, radius 10, hairline.
    // .kpi-num font-display 26/500 -0.025em; em italic body 14 ink-4.
    // .kpi-lab font-ui 11/500 ink-4 uppercase 0.08em.
    private var kpiGrid: some View {
        let k = vm.kpi
        return Grid(horizontalSpacing: 8, verticalSpacing: 8) {
            GridRow {
                kpiTile(num: "\(k.onTrackPct)", em: "%", label: "Routines on track")
                kpiTile(num: "\(k.advancing)",  em: nil, label: "Goals advancing")
            }
            GridRow {
                kpiTile(num: "\(k.longest)",    em: "d", label: "Longest streak")
                kpiTile(num: "\(k.notesAdded)", em: nil, label: "Notes added")
            }
        }
    }

    private func kpiTile(num: String, em: String?, label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(num)
                    .font(.system(size: 26, weight: .medium, design: .serif))
                    .tracking(-0.65)
                    .foregroundStyle(Theme.Color.ink)
                    .monospacedDigit()
                if let em {
                    Text(em)
                        .font(.system(size: 14, weight: .regular, design: .serif))
                        .italic()
                        .foregroundStyle(Theme.Color.ink4)
                }
            }
            Text(label.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(0.88)
                .foregroundStyle(Theme.Color.ink4)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
    }

    // MARK: - Period pills

    private var periodPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(AnalysisViewModel.Period.allCases) { p in
                    StatusPill(label: p.rawValue, active: vm.period == p) {
                        vm.period = p
                    }
                }
            }
        }
        .frame(height: 38)
    }

    // MARK: - Daily completion card

    private var dailyCompletionCard: some View {
        let s = vm.series
        return chartCard(
            title: "Daily completion",
            subtitle: "routines vs go-targets · \(vm.period.days) days",
            statNum: "\(s.routinesAvg)",
            statEm: "%",
            statLab: "routines avg"
        ) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 14) {
                    legendDot(color: Theme.Color.indigo, label: "Routines · \(s.routinesAvg)%")
                    legendDot(color: Theme.Color.moss,   label: "Go-targets · \(s.goAvg)%")
                }
                DualAreaChart(routines: s.routinePoints, gos: s.goPoints)
                    .frame(height: 140)
            }
        }
    }

    // MARK: - Goals vs plan card

    private var goalsVsPlanCard: some View {
        let bars = vm.goalBars
        let onTrack = bars.filter { $0.expected != nil && $0.pct >= ($0.expected ?? 0) }.count
        return chartCard(
            title: "Goals vs plan",
            subtitle: "Dashed line = expected today",
            statNum: "\(onTrack)",
            statEm: "/\(bars.count)",
            statLab: "on track"
        ) {
            GoalsBarsChart(bars: bars)
        }
    }

    // MARK: - Status donut card

    private var statusDonutCard: some View {
        let b = vm.statusBuckets
        return chartCard(
            title: "Routines by status",
            subtitle: "\(b.total) total",
            statNum: nil, statEm: nil, statLab: nil
        ) {
            HStack(alignment: .center, spacing: 18) {
                StatusDonut(strong: b.strong, active: b.active, slipping: b.slipping, hold: b.hold,
                            total: b.total)
                    .frame(width: 140, height: 140)
                VStack(alignment: .leading, spacing: 8) {
                    donutRow(color: Theme.Color.moss,   label: "Strong streak", num: b.strong)
                    donutRow(color: Theme.Color.indigo, label: "Active",        num: b.active)
                    donutRow(color: Theme.Color.ochre,  label: "Slipping",      num: b.slipping)
                    donutRow(color: Theme.Color.rust,   label: "On hold",       num: b.hold)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func donutRow(color: Color, label: String, num: Int) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(color)
                .frame(width: 9, height: 9)
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(Theme.Color.ink2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(num)")
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.Color.ink)
        }
    }

    // MARK: - Top streaks card

    private var topStreaksCard: some View {
        chartCard(
            title: "Top streaks",
            subtitle: "trending",
            statNum: nil, statEm: nil, statLab: nil
        ) {
            VStack(spacing: 12) {
                ForEach(Array(vm.topStreaks.enumerated()), id: \.element.id) { idx, row in
                    HStack(spacing: 12) {
                        Text("\(idx + 1)")
                            .font(.system(size: 16, weight: .medium, design: .serif))
                            .foregroundStyle(Theme.Color.ink5)
                            .frame(width: 18, alignment: .leading)
                        Text(row.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Theme.Color.ink)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Sparkline(values: row.lastN)
                            .frame(width: 64, height: 18)
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text("\(row.streak)")
                                .font(.system(size: 16, weight: .medium, design: .serif))
                                .foregroundStyle(Theme.Color.moss)
                                .monospacedDigit()
                            Text("d").italic()
                                .font(.system(size: 11, design: .serif))
                                .foregroundStyle(Theme.Color.ink4)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Year heatmap card

    private var yearHeatmapCard: some View {
        let y = vm.yearHeat
        return chartCard(
            title: "A year of practice",
            subtitle: "\(y.totalEntries) entries · \(y.pctActive)% with activity",
            statNum: nil, statEm: nil, statLab: nil
        ) {
            VStack(alignment: .leading, spacing: 8) {
                YearHeatmap(weeks: y.weeks)
                HStack(spacing: 5) {
                    Text("Less")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Theme.Color.ink5)
                    ForEach(0...4, id: \.self) { lvl in
                        RoundedRectangle(cornerRadius: 2, style: .continuous)
                            .fill(Self.heatColor(level: lvl))
                            .frame(width: 10, height: 10)
                    }
                    Text("More")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Theme.Color.ink5)
                }
            }
        }
    }

    static func heatColor(level: Int) -> Color {
        switch level {
        case 1:  return Theme.Color.moss.opacity(0.25)
        case 2:  return Theme.Color.moss.opacity(0.50)
        case 3:  return Theme.Color.moss.opacity(0.75)
        case 4:  return Theme.Color.moss
        default: return Theme.Color.cream
        }
    }

    // MARK: - Card chrome

    // CSS .chart-card: bg paper, border 1 hairline-strong, radius 12,
    // padding 16 14. .cc-head row with title (font-display 17/500) + sub
    // (font-ui 11 ink-5) + optional right-aligned stat (display 22 + em 12).
    @ViewBuilder
    private func chartCard<Content: View>(
        title: String,
        subtitle: String?,
        statNum: String?,
        statEm: String?,
        statLab: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 17, weight: .medium, design: .serif))
                        .tracking(-0.34)
                        .foregroundStyle(Theme.Color.ink)
                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.Color.ink5)
                    }
                }
                Spacer()
                if let statNum {
                    VStack(alignment: .trailing, spacing: 1) {
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text(statNum)
                                .font(.system(size: 22, weight: .medium, design: .serif))
                                .tracking(-0.55)
                                .foregroundStyle(Theme.Color.ink)
                                .monospacedDigit()
                            if let statEm {
                                Text(statEm)
                                    .font(.system(size: 12, weight: .regular, design: .serif))
                                    .italic()
                                    .foregroundStyle(Theme.Color.ink4)
                            }
                        }
                        if let statLab {
                            Text(statLab.uppercased())
                                .font(.system(size: 10, weight: .medium))
                                .tracking(0.8)
                                .foregroundStyle(Theme.Color.ink5)
                        }
                    }
                }
            }
            content()
        }
        .padding(.horizontal, 14).padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.Color.ink3)
        }
    }
}
