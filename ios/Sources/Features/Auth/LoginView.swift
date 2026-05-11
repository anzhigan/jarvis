import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var auth: AuthService

    @State private var email: String = ""
    @State private var password: String = ""
    @State private var error: String?
    @State private var isSubmitting: Bool = false
    @FocusState private var focused: Field?

    @Binding var route: AuthGate.Route

    enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                    .padding(.top, 32)
                    .padding(.bottom, 24)

                inputCard

                if let error {
                    Text(error)
                        .font(Theme.Font.uiSmall)
                        .foregroundStyle(Theme.Color.rust)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }

                submitButton
                    .padding(.top, 4)

                Button {
                    route = .register
                } label: {
                    HStack(spacing: 4) {
                        Text("New here?")
                            .foregroundStyle(Theme.Color.ink4)
                        Text("Create account")
                            .foregroundStyle(Theme.Color.indigo)
                    }
                    .font(Theme.Font.uiMedium)
                }
                .padding(.top, 8)

                Spacer(minLength: 32)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.Color.paper.ignoresSafeArea())
    }

    private var header: some View {
        VStack(spacing: 6) {
            Text("Jarvnote")
                .font(Theme.Font.displayLarge)
                .foregroundStyle(Theme.Color.ink)
            Text("Welcome back")
                .font(Theme.Font.bodyMedium)
                .foregroundStyle(Theme.Color.ink4)
        }
    }

    private var inputCard: some View {
        VStack(spacing: 0) {
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .focused($focused, equals: .email)
                .submitLabel(.next)
                .onSubmit { focused = .password }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .font(Theme.Font.uiMedium)
                .foregroundStyle(Theme.Color.ink)

            Divider()
                .background(Theme.Color.hairline)

            SecureField("Password", text: $password)
                .textContentType(.password)
                .focused($focused, equals: .password)
                .submitLabel(.go)
                .onSubmit { Task { await submit() } }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .font(Theme.Font.uiMedium)
                .foregroundStyle(Theme.Color.ink)
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Theme.Color.paper)
                .stroke(Theme.Color.hairlineStrong, lineWidth: 1)
        )
    }

    private var submitButton: some View {
        Button {
            Task { await submit() }
        } label: {
            HStack {
                if isSubmitting {
                    ProgressView().tint(.white)
                } else {
                    Text("Log in")
                        .font(Theme.Font.uiMedium)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .foregroundStyle(.white)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Theme.Color.indigo)
            )
        }
        .disabled(isSubmitting || email.isEmpty || password.isEmpty)
        .opacity((isSubmitting || email.isEmpty || password.isEmpty) ? 0.55 : 1.0)
    }

    private func submit() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            try await auth.login(email: email.trimmingCharacters(in: .whitespaces), password: password)
        } catch let err as APIError {
            self.error = err.localizedDescription
        } catch let err {
            self.error = err.localizedDescription
        }
    }
}
