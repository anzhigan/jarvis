import SwiftUI

// Top-level Notes screen, mirrored 1-for-1 from MobileNotesScreen.tsx:
//
//   ┌─ MobileTopBar (title + subtitle + avatar) ────┐
//   ├─ Search pill ─────────────────────────────────┤
//   ├─ Section bar: "Ways" ───────────── 2          │
//   │  Way folder row                                │
//   │  Way folder row                                │
//   │  + Way (m-add-btn dashed)                      │
//   │  + Note (m-add-btn dashed)                     │
//   └────────────────────────────────────────────────┘
//
// Tab bar is provided by MobileShell so this view only renders the body.

struct WaysListView: View {
    @ObservedObject var vm: NotesViewModel
    @Binding var path: NavigationPath
    @EnvironmentObject private var auth: AuthService
    @State private var newWayName: String = ""
    @State private var showCreate: Bool = false
    @State private var showCreateNote: Bool = false
    @State private var newNoteName: String = ""
    @State private var renamingWay: Way? = nil
    @State private var renameWayDraft: String = ""

    var body: some View {
        VStack(spacing: 0) {
            MobileTopBar(
                title: "Notes",
                subtitle: subtitleText,
                avatarInitial: avatarInitial,
                onAvatarTap: nil
            )

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    SearchPill(placeholder: "Search notes, tags, ways…", text: $vm.searchText)
                        .padding(.bottom, 4)

                    if vm.searchText.isEmpty {
                        SectionBar(title: "Ways", count: vm.ways.count)
                        ForEach(vm.ways) { way in
                            SwipeRow(
                                onEdit: {
                                    renameWayDraft = way.name
                                    renamingWay = way
                                },
                                onDelete: { Task { await vm.deleteWay(way.id) } },
                                onTap: { path.append(NotesRoute.way(way.id)) }
                            ) {
                                FolderRow(icon: "folder",
                                          name: way.name,
                                          meta: subtitle(for: way))
                            }
                        }
                        AddButton(label: "Way") { showCreate = true }
                            .padding(.top, 4)
                        AddButton(label: "Note") { showCreateNote = true; newNoteName = "" }
                    } else {
                        searchSection
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            .refreshable { await vm.load() }
            .background(Theme.Color.paper.ignoresSafeArea())
        }
        .toolbar(.hidden, for: .navigationBar)
        .alert("New way", isPresented: $showCreate) {
            TextField("Name", text: $newWayName)
            Button("Cancel", role: .cancel) { newWayName = "" }
            Button("Create") {
                let name = newWayName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                Task { await vm.createWay(name: name); newWayName = "" }
            }
        }
        .alert("Rename way",
               isPresented: Binding(get: { renamingWay != nil },
                                    set: { if !$0 { renamingWay = nil } }),
               presenting: renamingWay) { way in
            TextField("Name", text: $renameWayDraft)
            Button("Cancel", role: .cancel) { renamingWay = nil }
            Button("Save") {
                let trimmed = renameWayDraft.trimmingCharacters(in: .whitespaces)
                if !trimmed.isEmpty, trimmed != way.name {
                    Task { await vm.renameWay(way.id, name: trimmed) }
                }
                renamingWay = nil
            }
        } message: { _ in Text("Enter a new name for this way.") }
        .alert("New note", isPresented: $showCreateNote) {
            TextField("Name", text: $newNoteName)
            Button("Cancel", role: .cancel) { newNoteName = "" }
            Button("Create") {
                let name = newNoteName.trimmingCharacters(in: .whitespaces)
                guard !name.isEmpty else { return }
                // Creating a top-level note without a way creates an orphan
                // — the backend allows it, and they show up only via search.
                Task { _ = await vm.createNote(name: name, wayId: nil, topicId: nil); newNoteName = "" }
            }
        }
        .task { if vm.ways.isEmpty { await vm.load() } }
    }

    private var subtitleText: String {
        let notes = vm.ways.reduce(0) { $0 + $1.notes.count + $1.topics.reduce(0) { $0 + $1.notes.count } }
        let ways = vm.ways.count
        if vm.ways.isEmpty { return "No notes yet" }
        return "\(notes) note\(notes == 1 ? "" : "s") · \(ways) way\(ways == 1 ? "" : "s")"
    }

    private var avatarInitial: String {
        auth.currentUser?.username.first.map { String($0) } ?? "?"
    }

    private func subtitle(for way: Way) -> String {
        let topics = way.topics.count
        let notes  = way.notes.count
        switch (topics, notes) {
        case (0, 0): return "Empty"
        case (_, 0): return "\(topics) topic\(topics == 1 ? "" : "s")"
        case (0, _): return "\(notes) note\(notes == 1 ? "" : "s")"
        default:     return "\(topics) topic\(topics == 1 ? "" : "s") · \(notes) note\(notes == 1 ? "" : "s")"
        }
    }

    @ViewBuilder
    private var searchSection: some View {
        let hits = vm.search()
        if hits.isEmpty {
            Text("No notes match \"\(vm.searchText)\"")
                .font(.system(size: 14))
                .foregroundStyle(Theme.Color.ink4)
                .frame(maxWidth: .infinity)
                .padding(.top, 32)
        } else {
            SectionBar(title: "Search results", count: hits.count)
            ForEach(hits) { hit in
                NavigationLink(value: NotesRoute.note(hit.note.id)) {
                    FolderRow(
                        icon: "doc.text",
                        iconColor: Theme.Color.ink4,
                        name: hit.note.name,
                        meta: hit.breadcrumb
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// Routes used by the Notes NavigationStack. Each `case` maps to one screen.
enum NotesRoute: Hashable {
    case way(UUID)
    case topic(UUID)
    case note(UUID)
}
