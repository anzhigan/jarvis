import SwiftUI

// 1-for-1 port of `MobileTopBar` (web). Replaces SwiftUI's native nav bar
// where used. Visual spec from `.top-bar`/`.tb-*` in mobile.css:
//   • bar height 56, padding 0 14, hairline bottom border
//   • title font-display 17/500, letter-spacing -0.02em
//   • subtitle font-ui 10.5/500, ink-4, line-height 1.1 with title
//   • avatar 36×36, indigo→indigo-2 gradient, font-display 14 italic 500
//
// Tapping the avatar opens the Profile screen as a sheet — same default
// behaviour as the web side. Pass `onAvatarTap` to override (e.g. test
// hooks). Used by every tab's root via `.toolbar(.hidden, for: .navigationBar)`
// + this view stacked above the content.

struct MobileTopBar: View {
    let title: String
    var subtitle: String? = nil
    var avatarInitial: String? = nil
    var onAvatarTap: (() -> Void)? = nil
    var trailing: AnyView? = nil

    @EnvironmentObject private var repos: Repositories
    @State private var showingProfile: Bool = {
        #if DEBUG
        return UserDefaults.standard.bool(forKey: "JARV_OPEN_PROFILE")
        #else
        return false
        #endif
    }()

    var body: some View {
        VStack(spacing: 0) {
            OfflineBanner()
            barContent
        }
        .animation(.easeOut(duration: 0.18), value: showingProfile)
        .sheet(isPresented: $showingProfile) {
            ProfileView(repos: repos)
        }
    }

    private var barContent: some View {
        ZStack {
            Theme.Color.paper
                .ignoresSafeArea(edges: .top)

            VStack(spacing: 2) {
                Text(title)
                    .font(.system(size: 17, weight: .medium, design: .serif))
                    .tracking(-0.30)
                    .foregroundStyle(Theme.Color.ink)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundStyle(Theme.Color.ink4)
                }
            }
            .frame(maxWidth: .infinity)

            HStack {
                if let trailing { trailing }
                Spacer()
                if let initial = avatarInitial {
                    Button(action: handleAvatarTap) {
                        ZStack {
                            Circle()
                                .fill(LinearGradient(
                                    colors: [Theme.Color.indigo, Theme.Color.indigo2],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                            Text(initial.uppercased())
                                .font(.system(size: 14, weight: .medium, design: .serif))
                                .italic()
                                .foregroundStyle(Theme.Color.paper)
                        }
                        .frame(width: 36, height: 36)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
        }
        .frame(height: 56)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Theme.Color.hairline)
                .frame(height: 1)
        }
    }

    private func handleAvatarTap() {
        if let onAvatarTap {
            onAvatarTap()
        } else {
            showingProfile = true
        }
    }
}
