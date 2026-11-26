import SwiftUI

struct GenerateDeckView: View {
  @Environment(DeckStore.self) private var store
  @Environment(\.dismiss) private var dismiss

  @State private var topic = ""
  @State private var cardCount = 5
  @State private var isGenerating = false
  @State private var result: (deck: Deck, response: HybridResponse)?
  @State private var errorMessage: String?

  private let ai = HybridAI.shared
  private let cardCounts = [3, 5, 8, 12]

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Topic or study notes", text: $topic, axis: .vertical)
            .lineLimit(3...8)
          Picker("Cards", selection: $cardCount) {
            ForEach(cardCounts, id: \.self) { Text("\($0)").tag($0) }
          }
          .pickerStyle(.segmented)
        }

        Section {
          Button {
            Task { await generate() }
          } label: {
            HStack {
              Text(isGenerating ? "Generating…" : "Generate")
              if isGenerating {
                Spacer()
                ProgressView()
              }
            }
          }
          .disabled(isGenerating || topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } footer: {
          Text(statusText)
        }

        if let errorMessage {
          Section { Text(errorMessage).foregroundStyle(.red) }
        }

        if let result {
          Section {
            ForEach(result.deck.cards) { card in
              VStack(alignment: .leading, spacing: 4) {
                Text(card.term).font(.headline)
                Text(card.definition)
                if !card.mnemonic.isEmpty {
                  Text(card.mnemonic).font(.callout).foregroundStyle(.secondary)
                }
              }
            }
          } header: {
            Text(result.deck.title)
          } footer: {
            Label(
              "\(result.response.runtimeLabel) · \(result.response.latency.formatted(.units(allowed: [.seconds, .milliseconds], width: .narrow)))",
              systemImage: result.response.source == .onDevice ? "iphone" : "cloud")
          }
        }
      }
      .navigationTitle("New deck")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Save") {
            if let deck = result?.deck { store.add(deck) }
            dismiss()
          }
          .disabled(result == nil)
        }
      }
    }
  }

  private var statusText: String {
    switch (ai.onDeviceStatus, ai.isCloudConfigured) {
    case (.available, _): "Runs on-device with Apple Intelligence."
    case (let status, true): "\(status.message) Using Gemini in the cloud instead."
    case (let status, false): status.message
    }
  }

  private func generate() async {
    isGenerating = true
    errorMessage = nil
    defer { isGenerating = false }
    let topic = topic
    do {
      let response = try await ai.generate(
        prompt: DeckPrompt.generate(topic: topic, cardCount: cardCount),
        instructions: DeckPrompt.instructions)
      result = (try DeckPrompt.parse(response.text, topic: topic), response)
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

#Preview {
  GenerateDeckView().environment(DeckStore())
}
