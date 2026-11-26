import FirebaseAILogic
import FirebaseCore
import Foundation

#if canImport(FoundationModels)
  import FoundationModels
#endif

enum InferenceSource {
  case onDevice
  case inCloud
}

struct HybridResponse {
  let text: String
  let source: InferenceSource
  let runtimeLabel: String
  let latency: Duration
}

enum OnDeviceStatus {
  case available
  case downloading
  case notEnabled
  case unsupported

  var message: String {
    switch self {
    case .available: "Apple Intelligence is ready on this device."
    case .downloading: "Apple Intelligence is still downloading its model."
    case .notEnabled: "Turn on Apple Intelligence in Settings to run on-device."
    case .unsupported: "This device can't run Apple's on-device model."
    }
  }
}

struct NoModelAvailableError: LocalizedError {
  let reason: String
  var errorDescription: String? {
    "\(reason) Cloud fallback needs GoogleService-Info.plist in the app."
  }
}

/// Runs a prompt on Apple's on-device model when it's ready, and otherwise on Gemini
/// in the cloud through Firebase AI Logic.
final class HybridAI {
  static let shared = HybridAI()
  static let defaultCloudModel = "gemini-3-flash-preview"

  /// Overridden by Remote Config (`ios_cloud_model`).
  var cloudModelName = HybridAI.defaultCloudModel

  var isCloudConfigured: Bool { FirebaseApp.app() != nil }

  var onDeviceStatus: OnDeviceStatus {
    #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available: return .available
        case .unavailable(.modelNotReady): return .downloading
        case .unavailable(.appleIntelligenceNotEnabled): return .notEnabled
        default: return .unsupported
        }
      }
    #endif
    return .unsupported
  }

  func generate(prompt: String, instructions: String) async throws -> HybridResponse {
    let clock = ContinuousClock()
    let start = clock.now

    #if canImport(FoundationModels)
      if #available(iOS 26.0, *), onDeviceStatus == .available {
        let session = LanguageModelSession(instructions: instructions)
        let text = try await session.respond(to: prompt).content
        return HybridResponse(
          text: text, source: .onDevice,
          runtimeLabel: "Apple Foundation Models (on-device)",
          latency: clock.now - start)
      }
    #endif

    guard isCloudConfigured else { throw NoModelAvailableError(reason: onDeviceStatus.message) }
    let model = cloudModelName
    let text = try await runInCloud(prompt: prompt, instructions: instructions, model: model)
    return HybridResponse(
      text: text, source: .inCloud,
      runtimeLabel: "Firebase AI Logic (\(model))",
      latency: clock.now - start)
  }

  private func runInCloud(prompt: String, instructions: String, model: String) async throws -> String {
    let ai = FirebaseAI.firebaseAI(backend: .googleAI())

    // Xcode 27+ on iOS 27+: Gemini runs inside Apple's Foundation Models session API,
    // the same API as the on-device path.
    #if compiler(>=6.4) && canImport(FoundationModels) && canImport(GeminiLanguageModel)
      if #available(iOS 27.0, *) {
        let session = LanguageModelSession(
          model: ai.geminiLanguageModel(name: model), instructions: instructions)
        return try await session.respond(to: prompt).content
      }
    #endif

    let generativeModel = ai.generativeModel(
      modelName: model,
      generationConfig: GenerationConfig(responseMIMEType: "application/json"),
      systemInstruction: ModelContent(role: "system", parts: instructions))
    let response = try await generativeModel.generateContent(prompt)
    guard let text = response.text else { throw DeckPrompt.ParseError() }
    return text
  }
}
