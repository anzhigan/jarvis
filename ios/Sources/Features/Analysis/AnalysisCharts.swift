import SwiftUI
import Charts

// Native ports of the inline SVG charts in MobileAnalysisScreen.tsx.
// Implementation uses Swift Charts where it fits cleanly and falls back to
// Path/Shape primitives for the donut and the year heatmap (Charts has no
// pie/heatmap primitives in iOS 17).

// MARK: - DualAreaChart

/// Two overlaid filled-area lines: routines (indigo) on top of go-targets (moss).
/// Y axis fixed at 0…100, x axis is just index → no labels.
struct DualAreaChart: View {
    let routines: [Int]
    let gos:      [Int]

    var body: some View {
        let rPts = routines.enumerated().map { (i, v) in DataPoint(idx: i, value: Double(v), kind: .routine) }
        let gPts = gos.enumerated().map      { (i, v) in DataPoint(idx: i, value: Double(v), kind: .go) }

        Chart {
            ForEach(gPts) { p in
                AreaMark(x: .value("Day", p.idx), y: .value("Pct", p.value))
                    .foregroundStyle(Theme.Color.moss.opacity(0.10))
                    .interpolationMethod(.monotone)
            }
            ForEach(rPts) { p in
                AreaMark(x: .value("Day", p.idx), y: .value("Pct", p.value))
                    .foregroundStyle(Theme.Color.indigo.opacity(0.10))
                    .interpolationMethod(.monotone)
            }
            ForEach(gPts) { p in
                LineMark(x: .value("Day", p.idx), y: .value("Pct", p.value))
                    .foregroundStyle(Theme.Color.moss)
                    .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.monotone)
            }
            ForEach(rPts) { p in
                LineMark(x: .value("Day", p.idx), y: .value("Pct", p.value))
                    .foregroundStyle(Theme.Color.indigo)
                    .lineStyle(StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.monotone)
            }
        }
        .chartYScale(domain: 0...100)
        .chartYAxis {
            AxisMarks(position: .leading, values: [0, 25, 50, 75, 100]) { v in
                AxisGridLine().foregroundStyle(Theme.Color.hairline)
                AxisValueLabel {
                    if let n = v.as(Int.self) {
                        Text("\(n)")
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(Theme.Color.ink5)
                    }
                }
            }
        }
        .chartXAxis(.hidden)
    }

    private struct DataPoint: Identifiable {
        enum Kind { case routine, go }
        let idx: Int
        let value: Double
        let kind: Kind
        var id: String { "\(kind)-\(idx)" }
    }
}

// MARK: - GoalsBarsChart

/// Horizontal bars with a dashed "expected today" indicator. Uses a custom
/// stack of Capsule shapes since Swift Charts doesn't expose per-row dashed
/// reference markers cleanly.
struct GoalsBarsChart: View {
    let bars: [AnalysisViewModel.GoalBar]
    var body: some View {
        VStack(spacing: 6) {
            ForEach(bars) { bar in
                GeometryReader { geo in
                    let w = geo.size.width
                    let fillW = max(2, min(w, w * Double(bar.pct) / 100))
                    let expX  = bar.expected.map { max(2, min(w, w * Double($0) / 100)) }
                    ZStack(alignment: .leading) {
                        // Track
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(Theme.Color.cream)
                            .frame(height: 28)
                        // Filled progress
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(bar.color)
                            .frame(width: fillW, height: 28)
                        // Title overlay (white-on-fill)
                        HStack {
                            Text(bar.title)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Theme.Color.paper)
                                .lineLimit(1)
                                .padding(.leading, 10)
                            Spacer()
                            Text("\(bar.pct)%")
                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundStyle(Theme.Color.ink)
                                .padding(.trailing, 8)
                        }
                        // Dashed "expected today" line
                        if let expX {
                            Rectangle()
                                .stroke(Theme.Color.ink4, style: StrokeStyle(lineWidth: 1.2, dash: [3, 2]))
                                .frame(width: 1, height: 30)
                                .offset(x: expX - 0.5, y: -1)
                        }
                    }
                }
                .frame(height: 28)
            }
        }
    }
}

// MARK: - StatusDonut

/// Hand-drawn donut. Four colored segments + dark center number + uppercase
/// label below the number. Empty state draws the cream ring.
struct StatusDonut: View {
    let strong: Int
    let active: Int
    let slipping: Int
    let hold: Int
    let total: Int

    private var segments: [(value: Int, color: Color)] {
        [
            (strong,   Theme.Color.moss),
            (active,   Theme.Color.indigo),
            (slipping, Theme.Color.ochre),
            (hold,     Theme.Color.rust),
        ]
    }

    var body: some View {
        ZStack {
            if total == 0 {
                Circle().fill(Theme.Color.cream)
                Circle().fill(Theme.Color.paper).scaleEffect(42.0/64.0)
            } else {
                Canvas { ctx, size in
                    let cx = size.width / 2, cy = size.height / 2
                    let rOut = min(size.width, size.height) / 2
                    let rIn  = rOut * (42.0 / 64.0)
                    var cum: Double = 0
                    let totalD = Double(total)
                    for s in segments where s.value > 0 {
                        let a0 = (cum / totalD) * .pi * 2 - .pi / 2
                        cum += Double(s.value)
                        let a1 = (cum / totalD) * .pi * 2 - .pi / 2
                        var path = Path()
                        path.addArc(center: CGPoint(x: cx, y: cy), radius: rOut,
                                    startAngle: .radians(a0), endAngle: .radians(a1),
                                    clockwise: false)
                        path.addArc(center: CGPoint(x: cx, y: cy), radius: rIn,
                                    startAngle: .radians(a1), endAngle: .radians(a0),
                                    clockwise: true)
                        path.closeSubpath()
                        ctx.fill(path, with: .color(s.color))
                    }
                }
            }
            VStack(spacing: 3) {
                Text("\(total)")
                    .font(.system(size: 26, weight: .medium, design: .serif))
                    .foregroundStyle(Theme.Color.ink)
                    .monospacedDigit()
                Text("ROUTINES")
                    .font(.system(size: 9, weight: .medium))
                    .tracking(1.2)
                    .foregroundStyle(Theme.Color.ink4)
            }
        }
    }
}

// MARK: - Sparkline

/// 13-point sparkline used in the "Top streaks" rows. Y axis is auto-scaled
/// to the row's max so a routine with small target values still spans the
/// full height. Empty values render as a flat bottom line.
struct Sparkline: View {
    let values: [Double]
    var body: some View {
        GeometryReader { geo in
            Path { p in
                guard !values.isEmpty else { return }
                let w = geo.size.width, h = geo.size.height
                let maxV = max(1.0, values.max() ?? 1.0)
                let dx = w / Double(max(1, values.count - 1))
                for (i, v) in values.enumerated() {
                    let x = Double(i) * dx
                    let y = (h - 1) - (v / maxV * (h - 2))
                    if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
                    else      { p.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(Theme.Color.moss, style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
        }
    }
}

// MARK: - YearHeatmap

/// 53 weeks × 7 days grid, mapping `level` (0…4) to a moss-tinted colour.
/// Today's cell gets a subtle indigo ring on top.
struct YearHeatmap: View {
    let weeks: [[AnalysisViewModel.YearHeat.Cell]]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 2) {
                ForEach(Array(weeks.enumerated()), id: \.offset) { _, w in
                    VStack(spacing: 2) {
                        ForEach(w) { cell in
                            ZStack {
                                RoundedRectangle(cornerRadius: 2, style: .continuous)
                                    .fill(AnalysisTabRoot.heatColor(level: cell.level))
                                    .frame(width: 8, height: 8)
                                if cell.isToday {
                                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                                        .stroke(Theme.Color.indigo, lineWidth: 1.2)
                                        .frame(width: 8, height: 8)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
