import SwiftUI

// 1-for-1 port of MobileProfileScreen.tsx. Layout (top → bottom):
//   1. Top bar with "Profile" title and back chevron (dismisses sheet)
//   2. Header: big avatar + name + "Active since {month}" tagline
//   3. 4-stat row: Entries / Weeks / Routines / Goals
//   4. Section "Account": Name, Email
//   5. Section "Appearance": Theme (Light/Dark — placeholder for now)
//   6. Section "Security": Biometric unlock toggle (Face ID / Touch ID)
//   7. Section "About": Version, Send feedback, Sign out (danger)

struct ProfileView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var repos: Repositories
    @Environment(\.dismiss) private var dismiss
    @StateObject private var vm: ProfileViewModel

    @State private var biometryOn: Bool = BiometricSettings.isEnabled
    @State private var biometryError: String? = nil
    @State private var confirmingSignOut = false
    @State private var pickingTheme = false
    @AppStorage(ThemePreference.appStorageKey) private var themeRaw: String = ThemePreference.system.rawValue
    private var theme: ThemePreference { ThemePreference(rawValue: themeRaw) ?? .system }

    /// "1.0.1 (2)" — pulls the marketing + build numbers from Info.plist so
    /// the user can verify at a glance that they installed the right IPA.
    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? "?"
        let b = info?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }

    private let biometryKind: BiometricKind

    init(repos: Repositories) {
        _vm = StateObject(wrappedValue: ProfileViewModel(repos: repos))
        self.biometryKind = BiometricService.canEvaluate()
    }

    private var initial: String {
        auth.currentUser?.username.first.map { String($0) } ?? "?"
    }
    private var name: String { auth.currentUser?.username ?? "You" }
    private var email: String { auth.currentUser?.email ?? "—" }
    private var tagline: String? {
        vm.memberSinceLabel.map { "Active since \($0)" }
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    statsRow
                    accountSection
                    appearanceSection
                    securitySection
                    aboutSection
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .refreshable { await vm.load() }
        }
        .background(Theme.Color.paper.ignoresSafeArea())
        .task { if vm.routines.isEmpty { await vm.load() } }
        .confirmationDialog("Sign out of this device?",
                            isPresented: $confirmingSignOut,
                            titleVisibility: .visible) {
            Button("Sign out", role: .destructive) {
                BiometricSettings.isEnabled = false
                auth.logout()
                dismiss()
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert(
            "Couldn't enable \(biometryKind.label)",
            isPresented: Binding(get: { biometryError != nil },
                                 set: { if !$0 { biometryError = nil } }),
            presenting: biometryError
        ) { _ in
            Button("OK") { biometryError = nil }
        } message: { msg in Text(msg) }
        .confirmationDialog("Theme", isPresented: $pickingTheme, titleVisibility: .visible) {
            ForEach(ThemePreference.allCases) { pref in
                Button(pref.label) {
                    themeRaw = pref.rawValue
                    Haptics.selection()
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        ZStack {
            Theme.Color.paper.ignoresSafeArea(edges: .top)
            Text("Profile")
                .font(.system(size: 17, weight: .medium, design: .serif))
                .tracking(-0.30)
                .foregroundStyle(Theme.Color.ink)
            HStack {
                Button(action: { dismiss() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Theme.Color.ink3)
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.plain)
                Spacer()
            }
            .padding(.horizontal, 14)
        }
        .frame(height: 56)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Theme.Color.hairline).frame(height: 1)
        }
    }

    // MARK: - Header (big avatar + name + tagline)

    // CSS .pf-header / .pf-avatar-big (72×72 indigo gradient, Fraunces 32)
    // / .pf-name (display 26/500) / .pf-tagline (font-ui 12 ink-4).
    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle().fill(LinearGradient(
                    colors: [Theme.Color.indigo, Theme.Color.indigo2],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
                Text(initial.uppercased())
                    .font(.system(size: 32, weight: .medium, design: .serif))
                    .italic()
                    .foregroundStyle(Theme.Color.paper)
            }
            .frame(width: 72, height: 72)

            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.system(size: 26, weight: .medium, design: .serif))
                    .tracking(-0.65)
                    .foregroundStyle(Theme.Color.ink)
                if let tagline {
                    Text(tagline)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.Color.ink4)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
    }

    // MARK: - Stats row (.pf-stats — 4 columns separated by hairlines)

    private var statsRow: some View {
        let s = vm.stats
        return HStack(spacing: 0) {
            statBlock(num: "\(s.entries.formatted(.number))", label: "Entries")
            divider
            statBlock(num: "\(s.weeks)",  label: "Weeks")
            divider
            statBlock(num: "\(s.routines)", label: "Routines")
            divider
            statBlock(num: "\(s.goals)",  label: "Goals")
        }
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
    }

    private var divider: some View {
        Rectangle()
            .fill(Theme.Color.hairline)
            .frame(width: 1, height: 28)
    }

    private func statBlock(num: String, label: String) -> some View {
        VStack(spacing: 3) {
            Text(num)
                .font(.system(size: 22, weight: .medium, design: .serif))
                .tracking(-0.55)
                .foregroundStyle(Theme.Color.ink)
                .monospacedDigit()
            Text(label.uppercased())
                .font(.system(size: 10, weight: .medium))
                .tracking(0.85)
                .foregroundStyle(Theme.Color.ink4)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Sections

    // CSS .pf-section / .pf-section-label / .pf-section-body —
    // grouped list with uppercased small label above and a paper card body.
    @ViewBuilder
    private func section(_ label: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(.system(size: 11, weight: .medium))
                .tracking(0.88)
                .foregroundStyle(Theme.Color.ink5)
                .padding(.leading, 4)
            VStack(spacing: 0) { content() }
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Theme.Color.paper)
                        .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
                )
        }
    }

    private var accountSection: some View {
        section("Account") {
            Row(label: "Name",  value: name,  showArrow: false)
            sectionDivider
            Row(label: "Email", value: email, showArrow: false)
        }
    }

    private var appearanceSection: some View {
        section("Appearance") {
            Row(label: "Theme", value: theme.label, showArrow: true) {
                pickingTheme = true
            }
        }
    }

    @ViewBuilder
    private var securitySection: some View {
        if biometryKind != .none {
            section("Security") {
                HStack {
                    Text("Unlock with \(biometryKind.label)")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.Color.ink)
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { biometryOn },
                        set: { newValue in
                            Task { await toggleBiometry(newValue) }
                        }
                    ))
                    .labelsHidden()
                    .tint(Theme.Color.indigo)
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
            }
        }
    }

    private var aboutSection: some View {
        section("About") {
            Row(label: "Version", value: appVersion, showArrow: false)
            sectionDivider
            Row(label: "Send feedback", value: nil, showArrow: true) {
                if let url = URL(string: "mailto:support@jarvnote.ru") {
                    UIApplication.shared.open(url)
                }
            }
            sectionDivider
            Row(label: "Sign out", value: nil, showArrow: true, danger: true) {
                confirmingSignOut = true
            }
        }
    }

    private var sectionDivider: some View {
        Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            .padding(.leading, 14)
    }

    // MARK: - Biometry toggle

    private func toggleBiometry(_ on: Bool) async {
        if on {
            // Re-prompt on enable so the system sheet's success/cancel is the
            // user's confirmation that it works for them.
            let result = await BiometricService.evaluate(reason: "Enable \(biometryKind.label) for Jarvnote")
            switch result {
            case .success:
                biometryOn = true
                BiometricSettings.isEnabled = true
                Haptics.notify(.success)
            case .userCancelled:
                biometryOn = false
            case .unavailable:
                biometryOn = false
                biometryError = "\(biometryKind.label) is not available."
                Haptics.notify(.error)
            case .failed(let msg):
                biometryOn = false
                biometryError = msg
                Haptics.notify(.error)
            }
        } else {
            biometryOn = false
            BiometricSettings.isEnabled = false
            Haptics.impact(.light)
        }
    }

    // MARK: - Row

    private struct Row: View {
        let label: String
        let value: String?
        let showArrow: Bool
        var danger: Bool = false
        var onTap: (() -> Void)? = nil

        var body: some View {
            Button(action: { onTap?() }) {
                HStack(spacing: 10) {
                    Text(label)
                        .font(.system(size: 14, weight: danger ? .medium : .regular))
                        .foregroundStyle(danger ? Theme.Color.rust : Theme.Color.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let value {
                        Text(value)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.Color.ink4)
                    }
                    if showArrow {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.Color.ink5)
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(onTap == nil && !showArrow)
        }
    }
}
