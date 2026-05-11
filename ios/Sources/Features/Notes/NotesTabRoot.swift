import SwiftUI

// Root of the Notes tab. Owns the NavigationStack and dispatches the
// type-erased NotesRoute values to concrete screens. Sticking the path on
// the root means deep navigation state survives re-renders and supports
// programmatic pushes (e.g. opening a freshly-created note immediately).

struct NotesTabRoot: View {
    @StateObject private var vm: NotesViewModel
    @State private var path = NavigationPath()

    init(repos: Repositories) {
        _vm = StateObject(wrappedValue: NotesViewModel(repo: repos.notes))
    }

    var body: some View {
        NavigationStack(path: $path) {
            WaysListView(vm: vm, path: $path)
                .navigationDestination(for: NotesRoute.self) { route in
                    switch route {
                    case .way(let id):   WayDetailView(vm: vm, path: $path, wayId: id)
                    case .topic(let id): TopicDetailView(vm: vm, path: $path, topicId: id)
                    case .note(let id):  NoteEditorView(vm: vm, noteId: id)
                    }
                }
                .task {
                    #if DEBUG
                    await applyDebugAutoroute()
                    #endif
                }
        }
        .alert("Something went wrong",
               isPresented: Binding(
                    get: { vm.error != nil },
                    set: { if !$0 { vm.error = nil } }
               ),
               presenting: vm.error) { _ in
            Button("OK") { vm.error = nil }
        } message: { msg in
            Text(msg)
        }
    }

    #if DEBUG
    /// Honour `-JARV_AUTOROUTE_WAY_ID`, `-JARV_AUTOROUTE_TOPIC_ID`,
    /// `-JARV_AUTOROUTE_NOTE_ID` launch args so screenshot scripts can land
    /// on a specific deep screen without driving the touch UI. Stripped
    /// from non-DEBUG builds.
    private func applyDebugAutoroute() async {
        if vm.ways.isEmpty { await vm.load() }
        let defaults = UserDefaults.standard
        if let s = defaults.string(forKey: "JARV_AUTOROUTE_WAY_ID"), let id = UUID(uuidString: s) {
            path.append(NotesRoute.way(id))
        }
        if let s = defaults.string(forKey: "JARV_AUTOROUTE_TOPIC_ID"), let id = UUID(uuidString: s) {
            path.append(NotesRoute.topic(id))
        }
        if let s = defaults.string(forKey: "JARV_AUTOROUTE_NOTE_ID"), let id = UUID(uuidString: s) {
            path.append(NotesRoute.note(id))
        }
    }
    #endif
}
