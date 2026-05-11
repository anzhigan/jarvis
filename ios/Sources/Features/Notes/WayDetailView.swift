import SwiftUI

// Inside-a-Way screen — mirrors the web mobile layout: top bar with back
// button, "Topics" section, "Notes" section, two add buttons at the bottom.

struct WayDetailView: View {
    @ObservedObject var vm: NotesViewModel
    @Binding var path: NavigationPath
    @Environment(\.dismiss) private var dismiss
    let wayId: UUID

    @State private var newName = ""
    @State private var creatingTopic = false
    @State private var creatingNote = false
    @State private var renamingTopic: Topic? = nil
    @State private var renameTopicDraft: String = ""
    @State private var renamingNote: Note? = nil
    @State private var renameNoteDraft: String = ""

    private var way: Way? { vm.way(wayId) }

    var body: some View {
        VStack(spacing: 0) {
            // Custom top bar with back chevron + centered title.
            ZStack {
                Theme.Color.paper.ignoresSafeArea(edges: .top)
                Text(way?.name ?? "")
                    .font(.system(size: 18, weight: .medium, design: .serif))
                    .foregroundStyle(Theme.Color.ink)
                    .lineLimit(1)
                    .padding(.horizontal, 60)
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(Theme.Color.ink2)
                            .padding(8)
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 8)
            }
            .frame(height: 56)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Theme.Color.hairline).frame(height: 1)
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    if let way {
                        topicsSection(way: way)
                        notesSection(way: way)
                        AddButton(label: "Topic") { creatingTopic = true; newName = "" }
                        AddButton(label: "Note")  { creatingNote = true;  newName = "" }
                    } else {
                        Text("Way not found").foregroundStyle(Theme.Color.ink4)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            .background(Theme.Color.paper.ignoresSafeArea())
            .refreshable { await vm.load() }
        }
        .toolbar(.hidden, for: .navigationBar)
        .alert("New topic", isPresented: $creatingTopic) {
            TextField("Name", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Create") {
                let n = newName.trimmingCharacters(in: .whitespaces)
                guard !n.isEmpty else { return }
                Task { await vm.createTopic(wayId: wayId, name: n) }
            }
        }
        .alert("Rename topic",
               isPresented: Binding(get: { renamingTopic != nil },
                                    set: { if !$0 { renamingTopic = nil } }),
               presenting: renamingTopic) { topic in
            TextField("Name", text: $renameTopicDraft)
            Button("Cancel", role: .cancel) { renamingTopic = nil }
            Button("Save") {
                let trimmed = renameTopicDraft.trimmingCharacters(in: .whitespaces)
                if !trimmed.isEmpty, trimmed != topic.name {
                    Task { await vm.renameTopic(topic.id, name: trimmed) }
                }
                renamingTopic = nil
            }
        } message: { _ in Text("Enter a new name for this topic.") }
        .alert("Rename note",
               isPresented: Binding(get: { renamingNote != nil },
                                    set: { if !$0 { renamingNote = nil } }),
               presenting: renamingNote) { note in
            TextField("Name", text: $renameNoteDraft)
            Button("Cancel", role: .cancel) { renamingNote = nil }
            Button("Save") {
                let trimmed = renameNoteDraft.trimmingCharacters(in: .whitespaces)
                if !trimmed.isEmpty, trimmed != note.name {
                    Task { await vm.renameNote(note.id, name: trimmed) }
                }
                renamingNote = nil
            }
        } message: { _ in Text("Enter a new name for this note.") }
        .alert("New note", isPresented: $creatingNote) {
            TextField("Name", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Create") {
                let n = newName.trimmingCharacters(in: .whitespaces)
                guard !n.isEmpty else { return }
                Task { _ = await vm.createNote(name: n, wayId: wayId, topicId: nil) }
            }
        }
    }

    @ViewBuilder
    private func topicsSection(way: Way) -> some View {
        if !way.topics.isEmpty {
            SectionBar(title: "Topics", count: way.topics.count)
            ForEach(way.topics.sorted { $0.order < $1.order }) { topic in
                SwipeRow(
                    onEdit: {
                        renameTopicDraft = topic.name
                        renamingTopic = topic
                    },
                    onDelete: { Task { await vm.deleteTopic(topic.id) } },
                    onTap: { path.append(NotesRoute.topic(topic.id)) }
                ) {
                    FolderRow(
                        icon: "folder",
                        iconColor: Theme.Color.slate,
                        name: topic.name,
                        meta: "\(topic.notes.count) note\(topic.notes.count == 1 ? "" : "s")"
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func notesSection(way: Way) -> some View {
        let direct = way.notes.sorted {
            ($0.pinned ? -1 : $0.order) < ($1.pinned ? -1 : $1.order)
        }
        if !direct.isEmpty {
            SectionBar(title: "Notes", count: direct.count)
            ForEach(direct) { note in
                SwipeRow(
                    onEdit: {
                        renameNoteDraft = note.name
                        renamingNote = note
                    },
                    onDelete: { Task { await vm.deleteNote(note.id) } },
                    onTap: { path.append(NotesRoute.note(note.id)) }
                ) {
                    NoteFolderRow(note: note)
                }
            }
        }
        if way.topics.isEmpty && way.notes.isEmpty {
            VStack(spacing: 6) {
                Text("Empty")
                    .font(.system(size: 18, weight: .medium, design: .serif))
                    .foregroundStyle(Theme.Color.ink3)
                Text("Tap + to add a topic or a note.")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.Color.ink5)
            }
            .padding(.top, 60)
            .frame(maxWidth: .infinity)
        }
    }
}

// Tiny variant of FolderRow that adds a leading pin glyph for pinned notes.
struct NoteFolderRow: View {
    let note: Note
    var body: some View {
        FolderRow(
            icon: note.pinned ? "pin.fill" : "doc.text",
            iconColor: note.pinned ? Theme.Color.ochre : Theme.Color.ink4,
            name: note.name,
            meta: note.tags.isEmpty
                ? nil
                : note.tags.map { "#\($0.name)" }.joined(separator: " ")
        )
    }
}
