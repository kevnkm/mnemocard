import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import Foundation
import Observation

/// Keeps decks in a local JSON file and, when Firebase is configured, mirrors them to
/// Firestore at users/{uid}/decks/{deckId} after signing in anonymously. Merging follows
/// `mergeRemoteDecks` in packages/core/src/deck-sync.ts.
@Observable
final class DeckStore {
  private(set) var decks: [Deck] = []

  @ObservationIgnored private let fileURL: URL
  @ObservationIgnored private var userDecks: CollectionReference?
  @ObservationIgnored private var listener: ListenerRegistration?
  @ObservationIgnored private var authHandle: AuthStateDidChangeListenerHandle?
  @ObservationIgnored private var serverSynced = false

  init() {
    let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    fileURL = directory.appending(path: "decks.json")
    loadLocal()
    if FirebaseApp.app() != nil { startCloudSync() }
  }

  func add(_ deck: Deck) {
    decks.insert(deck, at: 0)
    saveLocal()
    upload(deck)
  }

  func delete(at offsets: IndexSet) {
    let removed = offsets.map { decks[$0] }
    decks.remove(atOffsets: offsets)
    saveLocal()
    for deck in removed {
      userDecks?.document(deck.id).delete { error in
        if let error { print("[Firestore] Deleting a deck failed: \(error)") }
      }
    }
  }

  // MARK: - Firestore

  private func startCloudSync() {
    authHandle = Auth.auth().addStateDidChangeListener { [weak self] auth, user in
      MainActor.assumeIsolated {
        guard let self else { return }
        guard let user else {
          auth.signInAnonymously { _, error in
            if let error { print("[Firestore] Anonymous sign-in failed, so decks stay local: \(error)") }
          }
          return
        }
        self.listen(uid: user.uid)
      }
    }
  }

  private func listen(uid: String) {
    listener?.remove()
    serverSynced = false
    let collection = Firestore.firestore().collection("users").document(uid).collection("decks")
    userDecks = collection
    listener = collection.order(by: "createdAt", descending: true)
      .addSnapshotListener(includeMetadataChanges: true) { [weak self] snapshot, error in
        guard let snapshot else {
          if let error { print("[Firestore] Deck sync stopped: \(error)") }
          return
        }
        let remote = snapshot.documents.compactMap { Deck(id: $0.documentID, firestoreData: $0.data()) }
        let fromServer = !snapshot.metadata.isFromCache
        MainActor.assumeIsolated { self?.merge(remote: remote, fromServer: fromServer) }
      }
  }

  private func merge(remote: [Deck], fromServer: Bool) {
    let remoteByID = Dictionary(remote.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var uploads: [Deck] = []
    if fromServer && !serverSynced {
      serverSynced = true
      uploads = decks.filter { deck in
        guard let stored = remoteByID[deck.id] else { return true }
        return deck.updatedAt > stored.updatedAt
      }
    }
    let keepLocal = Set(uploads.map(\.id))
    let localIDs = Set(decks.map(\.id))
    let merged = decks.compactMap { deck -> Deck? in
      if keepLocal.contains(deck.id) { return deck }
      if let stored = remoteByID[deck.id] { return stored }
      return serverSynced ? nil : deck
    }
    decks = remote.filter { !localIDs.contains($0.id) } + merged
    saveLocal()
    uploads.forEach(upload)
  }

  private func upload(_ deck: Deck) {
    // Before sign-in finishes, the first server snapshot uploads it instead.
    userDecks?.document(deck.id).setData(deck.firestoreData) { error in
      if let error { print("[Firestore] Saving a deck failed: \(error)") }
    }
  }

  // MARK: - Local file

  private func loadLocal() {
    guard let data = try? Data(contentsOf: fileURL) else { return }
    decks = (try? JSONDecoder().decode([Deck].self, from: data)) ?? []
  }

  private func saveLocal() {
    do {
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try JSONEncoder().encode(decks).write(to: fileURL, options: .atomic)
    } catch {
      print("[MnemoCard] Failed to save decks: \(error)")
    }
  }
}
