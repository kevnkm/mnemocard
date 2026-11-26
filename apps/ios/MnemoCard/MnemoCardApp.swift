import FirebaseAppCheck
import FirebaseCore
import SwiftUI

@main
struct MnemoCardApp: App {
  @State private var store: DeckStore

  init() {
    Self.configureFirebase()
    // Created after Firebase so the store can start syncing to Firestore.
    _store = State(initialValue: DeckStore())
  }

  var body: some Scene {
    WindowGroup {
      DeckListView()
        .environment(store)
        .task { await RemoteSettings.load() }
    }
  }

  private static func configureFirebase() {
    // Without a Firebase config the app still runs, using the on-device model and local storage.
    guard Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil else {
      print("[MnemoCard] GoogleService-Info.plist not found. Cloud features are off.")
      return
    }
    // App Check must be set up before FirebaseApp.configure().
    #if DEBUG
      AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
    #else
      AppCheck.setAppCheckProviderFactory(AppAttestProviderFactory())
    #endif
    FirebaseApp.configure()
  }
}
