import SwiftUI

// Top-level routing: shows LoginView / RegisterView when signed out, the
// signed-in scaffold otherwise. Replaced in Stage 5+ with the tabbed shell;
// for Stage 2 the signed-in side is just a "Hi {username}" + Logout placeholder.
struct AuthGate: View {
    @EnvironmentObject private var auth: AuthService
    @State private var route: Route = .login
    @State private var biometricLocked: Bool = BiometricSettings.isEnabled

    enum Route: Equatable { case login, register }

    var body: some View {
        Group {
            if auth.isBootstrapping {
                splash
            } else if auth.isAuthenticated {
                ZStack {
                    MobileShell()
                    // Cover the shell with an unlock screen until Face ID
                    // succeeds. Tokens are already in Keychain so the user is
                    // technically signed-in — biometry is just a UX gate.
                    if biometricLocked { biometricLockOverlay }
                }
            } else {
                NavigationStack {
                    switch route {
                    case .login:    LoginView(route: $route)
                    case .register: RegisterView(route: $route)
                    }
                }
            }
        }
        .task {
            if auth.isBootstrapping {
                await auth.bootstrap()
            }
            await maybePromptBiometry()
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthed in
            // Re-arm the lock whenever a fresh login lands.
            if isAuthed { biometricLocked = BiometricSettings.isEnabled }
            Task { await maybePromptBiometry() }
        }
    }

    private func maybePromptBiometry() async {
        guard auth.isAuthenticated, biometricLocked,
              BiometricSettings.isEnabled,
              BiometricService.canEvaluate() != .none else {
            biometricLocked = false
            return
        }
        let kind = BiometricService.canEvaluate()
        let result = await BiometricService.evaluate(reason: "Unlock Jarvnote with \(kind.label)")
        switch result {
        case .success, .unavailable:
            biometricLocked = false
        case .userCancelled, .failed:
            // Stay locked; the overlay's Retry button kicks the prompt again.
            biometricLocked = true
        }
    }

    private var biometricLockOverlay: some View {
        let kind = BiometricService.canEvaluate()
        return ZStack {
            Theme.Color.paper.ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: kind == .faceID ? "faceid" : "touchid")
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(Theme.Color.indigo)
                Text("Jarvnote is locked")
                    .font(.system(size: 22, weight: .medium, design: .serif))
                    .foregroundStyle(Theme.Color.ink)
                Text("Authenticate to continue.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.ink4)
                Button {
                    Task { await maybePromptBiometry() }
                } label: {
                    Text("Use \(kind.label)")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.Color.paper)
                        .frame(width: 180, height: 44)
                        .background(Capsule().fill(Theme.Color.indigo))
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
        }
    }

    // Continuation of LaunchScreen.storyboard — shows the same Paper bg +
    // centered logo while AuthService bootstraps from Keychain so the user
    // never sees a blank screen or a stray spinner during cold start.
    private var splash: some View {
        ZStack {
            Theme.Color.paper.ignoresSafeArea()
            VStack(spacing: 18) {
                Image("AppLogo")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 120, height: 120)
                ProgressView()
                    .tint(Theme.Color.indigo)
                    .scaleEffect(0.9)
            }
        }
    }
}

