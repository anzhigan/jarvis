import SwiftUI

struct TopicDetailView: View {
    @ObservedObject var vm: NotesViewModel
    @Binding var path: NavigationPath
    @Environment(\.dismiss) private var dismiss
    let topicId: UUID

    @State private var newName = ""
    @State private var creating = false
    @State private var renamingNote: Note? = nil
    @State private var renameNoteDraft: String = ""

    private var topic: Topic? { vm.topic(topicId) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Theme.Color.paper.ignoresSafeArea(edges: .top)
                Text(topic?.name ?? "")
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
                    if let topic {
                        let notes = topic.notes.sorted {
                            ($0.pinned ? -1 : $0.order) < ($1.pinned ? -1 : $1.order)
                        }
                        if !notes.isEmpty {
                            SectionBar(title: "Notes", count: notes.count)
                            ForEach(notes) { n in
                                SwipeRow(
                                    onEdit: {
                                        renameNoteDraft = n.name
                                        renamingNote = n
                                    },
                                    onDelete: { Task { await vm.deleteNote(n.id) } },
                                    onTap: { path.append(NotesRoute.note(n.id)) }
                                ) {
                                    NoteFolderRow(note: n)
                                }
                            }
                        } else {
                            VStack(spacing: 6) {
                                Text("No notes yet")
                                    .font(.system(size: 18, weight: .medium, design: .serif))
                                    .foregroundStyle(Theme.Color.ink3)
                                Text("Tap + to write the first one.")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.Color.ink5)
                            }
                            .padding(.top, 60)
                            .frame(maxWidth: .infinity)
                        }
                        AddButton(label: "Note") { creating = true; newName = "" }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            .background(Theme.Color.paper.ignoresSafeArea())
            .refreshable { await vm.load() }
        }
        .toolbar(.hidden, for: .navigationBar)
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
        .alert("New note", isPresented: $creating) {
            TextField("Name", text: $newName)
            Button("Cancel", role: .cancel) {}
            Button("Create") {
                let n = newName.trimmingCharacters(in: .whitespaces)
                guard let topic, !n.isEmpty else { return }
                Task { _ = await vm.createNote(name: n, wayId: topic.wayId, topicId: topic.id) }
            }
        }
    }
}
