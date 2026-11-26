import FirebaseCore
import FirebaseRemoteConfig
import Foundation

/// Reads the cloud model from Remote Config. Falls back to cached values, then to the default.
enum RemoteSettings {
  static let cloudModelKey = "ios_cloud_model"

  static func load() async {
    guard FirebaseApp.app() != nil else { return }
    let remoteConfig = RemoteConfig.remoteConfig()
    let settings = RemoteConfigSettings()
    #if DEBUG
      settings.minimumFetchInterval = 0
    #endif
    remoteConfig.configSettings = settings
    remoteConfig.setDefaults([cloudModelKey: HybridAI.defaultCloudModel as NSObject])

    do {
      _ = try await remoteConfig.fetchAndActivate()
    } catch {
      print("[Remote Config] Fetch failed, using cached or default values: \(error)")
    }

    let value = remoteConfig.configValue(forKey: cloudModelKey).stringValue
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !value.isEmpty { HybridAI.shared.cloudModelName = value }
  }
}
