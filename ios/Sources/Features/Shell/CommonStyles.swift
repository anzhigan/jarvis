import SwiftUI

// Reusable view styles whose visual spec lives in `frontend/src/styles/mobile.css`.
// Every helper here maps 1-for-1 to a CSS class on the web side; comments name
// the class so the parity is grep-able. Numeric values mirror the CSS exactly.

// MARK: - .m-add-btn
// Full-width dashed-border CTA used as "+ Way", "+ Note", "+ Goal" etc.
// CSS: height 44, padding 0 14, border 1 dashed hairline-strong, radius 10,
// color ink-4, font-ui 14/500, gap 6, icon 14×14.

struct AddButton: View {
    let label: String
    var systemImage: String = "plus"
    let action: () -> Void
    var body: some View {
        Button(action: { Haptics.impact(.light); action() }) {
            HStack(spacing: 6) {
                Image(systemName: systemImage).font(.system(size: 14, weight: .regular))
                Text(label).font(.system(size: 14, weight: .medium))
            }
            .foregroundStyle(Theme.Color.ink4)
            .frame(maxWidth: .infinity)
            .frame(height: 44)
            .padding(.horizontal, 14)
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5]))
                    .foregroundStyle(Theme.Color.hairlineStrong)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - .sp-pill / .sp-pill-active
// Status filter pills — cream when idle, indigo+paper when active.
// CSS: min-height 38, padding 9 18, font-ui 13.5/500 (same weight idle & active),
// color ink-3 / paper, bg cream / indigo, radius 999.

struct StatusPill: View {
    let label: String
    let active: Bool
    let action: () -> Void
    var body: some View {
        Button(action: { Haptics.selection(); action() }) {
            Text(label)
                .font(.system(size: 13.5, weight: .medium))
                .foregroundStyle(active ? Theme.Color.paper : Theme.Color.ink3)
                .padding(.horizontal, 18).padding(.vertical, 9)
                .frame(minHeight: 38)
                .background(Capsule().fill(active ? Theme.Color.indigo : Theme.Color.cream))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - .section-bar / .sec-title / .sec-rule / .sec-meta
// "Ways" / "Topics" / "Notes" headers with a hairline rule and a count.
// CSS: gap 10, margin 8 0 10. Title font-display 15/500, letter-spacing -0.02em
// (≈ -0.30 tracking). Meta font-mono 11 ink-5.

struct SectionBar: View {
    let title: String
    var count: Int? = nil
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title)
                .font(.system(size: 15, weight: .medium, design: .serif))
                .tracking(-0.30)
                .foregroundStyle(Theme.Color.ink)
            Rectangle()
                .fill(Theme.Color.hairline)
                .frame(height: 1)
            if let count {
                Text("\(count)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.Color.ink5)
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 10)
    }
}

// MARK: - .m-folder-row
// Notes Way/Topic/Note rows. Flat row with icon + name + meta + chevron.
// CSS: padding 14 14, bg paper, border 1 hairline-strong, radius 10,
// box-shadow 0 1px 2px rgba(15,24,32,0.04). Font-ui 14, name weight 500.
// Meta font-mono 11 ink-5, chev ink-5.

struct FolderRow<Trailing: View>: View {
    let icon: String
    var iconColor: Color = Theme.Color.indigo
    let name: String
    let meta: String?
    @ViewBuilder var trailing: Trailing
    init(
        icon: String,
        iconColor: Color = Theme.Color.indigo,
        name: String,
        meta: String?,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) {
        self.icon = icon
        self.iconColor = iconColor
        self.name = name
        self.meta = meta
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(iconColor)
            Text(name)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Theme.Color.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let meta {
                Text(meta)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Theme.Color.ink5)
            }
            trailing
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.Color.ink5)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.04), radius: 1, x: 0, y: 1)
    }
}

// MARK: - .search-pill
// Cream rounded-rectangle search input with a magnifier glyph.
// CSS: height 40, padding 0 12, border-radius 10 (NOT a capsule!),
// gap 8, magnifier 16×16 ink-4. Input font-ui 14, ink text, ink-4 placeholder.

struct SearchPill: View {
    let placeholder: String
    @Binding var text: String
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16))
                .foregroundStyle(Theme.Color.ink4)
            TextField(placeholder, text: $text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.ink)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
        }
        .padding(.horizontal, 12)
        .frame(height: 40)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.cream)
        )
    }
}
