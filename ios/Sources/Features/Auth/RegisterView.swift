import SwiftUI

struct RegisterView: View {
    @EnvironmentObject private var auth: AuthService

    @State private var email: String = ""
    @State private var username: String = ""
    @State private var password: String = ""
    @State private var error: String?
    @State private var isSubmitting: Bool = false
    @FocusState private var focused: Field?

    @Binding var route: AuthGate.Route

    enum Field { case email, username, password }

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
                    route = .login
                } label: {
                    HStack(spacing: 4) {
                        Text("Have an account?")
                            .foregroundStyle(Theme.Color.ink4)
                        Text("Log in")
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
            Text("Create account")
                .font(Theme.Font.displayLarge)
                .foregroundStyle(Theme.Color.ink)
            Text("Personal knowledge base — for one")
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
                .onSubmit { focused = .username }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .font(Theme.Font.uiMedium)
                .foregroundStyle(Theme.Color.ink)

            Divider().background(Theme.Color.hairline)

            TextField("Username", text: $username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .focused($focused, equals: .username)
                .submitLabel(.next)
                .onSubmit { focused = .password }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .font(Theme.Font.uiMedium)
                .foregroundStyle(Theme.Color.ink)

            Divider().background(Theme.Color.hairline)

            SecureField("Password (8+ chars)", text: $password)
                .textContentType(.newPassword)
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
                    Text("Create account")
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
        .disabled(isSubmitting || !canSubmit)
        .opacity((isSubmitting || !canSubmit) ? 0.55 : 1.0)
    }

    private var canSubmit: Bool {
        !email.isEmpty && username.count >= 3 && password.count >= 8
    }

    private func submit() async {
        guard canSubmit, !isSubmitting else { return }
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            try await auth.register(
                email: email.trimmingCharacters(in: .whitespaces),
                username: username.trimmingCharacters(in: .whitespaces),
                password: password
            )
        } catch let err as APIError {
            self.error = err.localizedDescription
        } catch let err {
            self.error = err.localizedDescription
        }
    }
}
