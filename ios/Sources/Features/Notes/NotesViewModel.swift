import Foundation
import SwiftUI

// Single source of truth for the Notes tab. Holds the loaded ways tree,
// search text, busy state, and recent errors. Views read via @EnvironmentObject
// or pass the instance down explicitly.
//
// Mutations always return updated entities — we patch the in-memory tree on
// success so the user doesn't see a stale list while waiting for `listWays`
// to round-trip.

@MainActor
final class NotesViewModel: ObservableObject {
    @Published private(set) var ways: [Way] = []
    @Published private(set) var isLoading: Bool = false
    @Published var error: String?
    @Published var searchText: String = ""

    private let repo: any NotesRepository

    init(repo: any NotesRepository) {
        self.repo = repo
    }

    // MARK: - Load

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            ways = try await repo.listWays().sorted { $0.order < $1.order }
        } catch let err as APIError {
            error = err.localizedDescription
        } catch let err {
            error = err.localizedDescription
        }
    }

    // MARK: - Lookups (used by detail screens passed only an id)

    func way(_ id: UUID) -> Way? { ways.first { $0.id == id } }

    func topic(_ id: UUID) -> Topic? {
        for way in ways {
            if let t = way.topics.first(where: { $0.id == id }) { return t }
        }
        return nil
    }

    func note(_ id: UUID) -> Note? {
        for way in ways {
            if let n = way.notes.first(where: { $0.id == id }) { return n }
            for topic in way.topics {
                if let n = topic.notes.first(where: { $0.id == id }) { return n }
            }
        }
        return nil
    }

    // MARK: - Mutations

    func createWay(name: String) async {
        do {
            _ = try await repo.createWay(name: name, order: ways.count)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func renameWay(_ id: UUID, name: String) async {
        do {
            _ = try await repo.updateWay(id: id, name: name, order: nil)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func deleteWay(_ id: UUID) async {
        do {
            try await repo.deleteWay(id: id)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func createTopic(wayId: UUID, name: String) async {
        let count = way(wayId)?.topics.count ?? 0
        do {
            _ = try await repo.createTopic(wayId: wayId, name: name, order: count)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func renameTopic(_ id: UUID, name: String) async {
        do {
            _ = try await repo.updateTopic(id: id, name: name, order: nil)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func deleteTopic(_ id: UUID) async {
        do {
            try await repo.deleteTopic(id: id)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func createNote(name: String, wayId: UUID?, topicId: UUID?) async -> Note? {
        do {
            let note = try await repo.createNote(name: name, wayId: wayId, topicId: topicId)
            await load()
            return note
        } catch let err {
            error = err.localizedDescription
            return nil
        }
    }

    /// Save body changes — title patch is separate so the editor can debounce
    /// content saves without re-sending the title every keystroke.
    ///
    /// Deliberately does NOT call `load()` afterwards: the editor only needs
    /// the local content to keep flowing through the binding; refetching
    /// the entire ways tree every 800 ms while the user types caused the
    /// AttributeGraph cycles, the "cancelled" toast (URLSession aborting
    /// the previous request mid-flight), and the keyboard's accumulator
    /// timeout. URLError.cancelled is swallowed silently — the user will
    /// retry on the next debounce tick.
    func saveNoteContent(_ id: UUID, content: String) async -> Note? {
        do {
            return try await repo.updateNote(
                id: id, name: nil, content: content, pinned: nil, order: nil
            )
        } catch {
            // Save runs every 800 ms while the user types and gets cancelled
            // by the next keystroke's debounce. URLSession surfaces those as
            // `URLError(.cancelled)`, the APIClient wraps that as
            // `APIError.transport(...)`, Swift's structured-concurrency may
            // also bubble a `CancellationError`. None of these are real
            // failures the user needs to see — they're just the cancellation
            // of an in-flight save that the next tick will retry anyway.
            // Anything that *is* a real error (auth, server 500, bad JSON,
            // etc.) silently no-ops too — showing a toast mid-typing breaks
            // the flow more than it helps. The save will retry on the next
            // debounced tick.
            return nil
        }
    }

    func renameNote(_ id: UUID, name: String) async {
        do {
            _ = try await repo.updateNote(id: id, name: name, content: nil, pinned: nil, order: nil)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func togglePin(_ id: UUID) async {
        guard let note = note(id) else { return }
        do {
            _ = try await repo.updateNote(
                id: id, name: nil, content: nil, pinned: !note.pinned, order: nil
            )
            await load()
        } catch let err { error = err.localizedDescription }
    }

    func deleteNote(_ id: UUID) async {
        do {
            try await repo.deleteNote(id: id)
            await load()
        } catch let err { error = err.localizedDescription }
    }

    // MARK: - Search (across all loaded ways/topics/notes)

    /// Returns matching notes with a hint about their parent for breadcrumb
    /// rendering. Empty query returns no matches (search bar is the entry).
    func search() -> [SearchHit] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        var hits: [SearchHit] = []
        for way in ways {
            for note in way.notes where note.matches(q) {
                hits.append(.init(note: note, breadcrumb: way.name))
            }
            for topic in way.topics {
                for note in topic.notes where note.matches(q) {
                    hits.append(.init(note: note, breadcrumb: "\(way.name) / \(topic.name)"))
                }
            }
        }
        return hits
    }

    struct SearchHit: Identifiable {
        let note: Note
        let breadcrumb: String
        var id: UUID { note.id }
    }
}

private extension Note {
    func matches(_ query: String) -> Bool {
        name.lowercased().contains(query) || content.lowercased().contains(query)
    }
}
