import AuthenticationServices
import SwiftUI
import SyncCore

public struct LoginView: View {
    @Environment(APIClient.self) private var apiClient
    @Environment(\.webAuthenticationSession) private var webAuthSession
    @State private var isSigningIn = false
    @State private var error: String?

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 8) {
                Text("ReadingSync")
                    .font(.largeTitle.bold())
                Text("Pick up where you left off")
                    .font(.body)
                    .foregroundStyle(.secondary)
            }
            .padding(.bottom, 64)

            VStack(spacing: 12) {
                Button {
                    Task { await signIn() }
                } label: {
                    Group {
                        if isSigningIn {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Continue with Google")
                                .fontWeight(.semibold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isSigningIn)

                if let error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            .padding(.horizontal, 32)

            Spacer()

            Text("By continuing, you agree to our Terms of Service and Privacy Policy")
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 16)
        }
    }

    private func signIn() async {
        isSigningIn = true
        error = nil
        defer { isSigningIn = false }

        do {
            let callbackURL = try await webAuthSession.authenticate(
                using: apiClient.signInURL,
                callbackURLScheme: "readingsync"
            )

            guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else {
                error = "Invalid callback URL"
                return
            }

            if let token = components.queryItems?.first(where: { $0.name == "token" })?.value {
                try apiClient.setToken(token)
            } else if let authError = components.queryItems?.first(where: { $0.name == "error" })?.value {
                error = authError
            } else {
                error = "Sign in failed. Please try again."
            }
        } catch is CancellationError {
            // User dismissed — no error
        } catch {
            self.error = "Something went wrong. Please try again."
        }
    }
}
