import SwiftUI
import SyncCore

@MainActor
@Observable
final class SettingsViewModel {
    var keys: [ApiKey] = []
    var isLoading = false
    var error: String?
    var newKeyName = "KOReader"
    var creating = false
    var revealedKey: NewApiKey?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func load() async {
        isLoading = keys.isEmpty
        error = nil
        do {
            keys = try await apiClient.listApiKeys()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func createKey() async {
        creating = true
        defer { creating = false }
        do {
            let created = try await apiClient.createApiKey(name: newKeyName)
            revealedKey = created
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func revoke(_ key: ApiKey) async {
        do {
            try await apiClient.revokeApiKey(id: key.id)
            keys.removeAll { $0.id == key.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

public struct SettingsView: View {
    @Environment(APIClient.self) private var apiClient
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: SettingsViewModel?
    @State private var showCreateSheet = false

    public init() {}

    public var body: some View {
        NavigationStack {
            Group {
                if let viewModel {
                    list(viewModel)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .task {
            let vm = SettingsViewModel(apiClient: apiClient)
            viewModel = vm
            await vm.load()
        }
    }

    @ViewBuilder
    private func list(_ vm: SettingsViewModel) -> some View {
        List {
            Section("API Keys") {
                if vm.isLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if vm.keys.isEmpty {
                    Text("No API keys yet. Create one for the KOReader plugin.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(vm.keys) { key in
                        keyRow(key)
                            .swipeActions {
                                Button(role: .destructive) {
                                    Task { await vm.revoke(key) }
                                } label: {
                                    Label("Revoke", systemImage: "trash")
                                }
                            }
                    }
                }

                Button {
                    showCreateSheet = true
                } label: {
                    Label("Create New Key", systemImage: "plus.circle")
                }
            }

            if let error = vm.error {
                Section { Text(error).foregroundStyle(.red) }
            }

            Section {
                Button("Sign Out", role: .destructive) {
                    apiClient.logout()
                    dismiss()
                }
            }
        }
        .sheet(isPresented: $showCreateSheet) {
            createKeySheet(vm)
        }
        .sheet(item: Binding(
            get: { vm.revealedKey },
            set: { vm.revealedKey = $0 }
        )) { revealed in
            revealedKeySheet(revealed)
        }
    }

    @ViewBuilder
    private func keyRow(_ key: ApiKey) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(key.name ?? "Untitled")
                .font(.body)
            HStack(spacing: 6) {
                Text(key.prefix + "…")
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                if let lastUsed = key.lastUsedAt {
                    Text("·")
                        .foregroundStyle(.tertiary)
                    Text("Last used \(formatRelative(lastUsed))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func createKeySheet(_ vm: SettingsViewModel) -> some View {
        NavigationStack {
            Form {
                TextField("Name", text: Binding(
                    get: { vm.newKeyName },
                    set: { vm.newKeyName = $0 }
                ))
                .textInputAutocapitalization(.never)

                Section {
                    Button {
                        Task {
                            await vm.createKey()
                            showCreateSheet = false
                        }
                    } label: {
                        if vm.creating {
                            ProgressView()
                        } else {
                            Text("Create")
                        }
                    }
                    .disabled(vm.newKeyName.trimmingCharacters(in: .whitespaces).isEmpty || vm.creating)
                }
            }
            .navigationTitle("New API Key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { showCreateSheet = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    @ViewBuilder
    private func revealedKeySheet(_ key: NewApiKey) -> some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "key.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.tint)

                Text("Copy this key now")
                    .font(.headline)

                Text("This is the only time you'll see the full key. Save it to your KOReader config at /mnt/us/.reading_sync_config.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)

                Text(key.key)
                    .font(.body.monospaced())
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal)
                    .textSelection(.enabled)

                Button {
                    UIPasteboard.general.string = key.key
                } label: {
                    Label("Copy to Clipboard", systemImage: "doc.on.doc")
                }
                .buttonStyle(.borderedProminent)

                Spacer()
            }
            .padding(.top, 24)
            .navigationTitle("API Key Created")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        viewModel?.revealedKey = nil
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func formatRelative(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else {
            return iso
        }
        let style = RelativeDateTimeFormatter()
        style.unitsStyle = .short
        return style.localizedString(for: date, relativeTo: .now)
    }
}
