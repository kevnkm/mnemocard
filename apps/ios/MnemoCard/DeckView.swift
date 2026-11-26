import SwiftUI

struct DeckView: View {
  let deck: Deck

  var body: some View {
    TabView {
      ForEach(deck.cards) { card in
        FlashcardView(card: card).padding()
      }
    }
    .tabViewStyle(.page)
    .indexViewStyle(.page(backgroundDisplayMode: .always))
    .navigationTitle(deck.title)
    .navigationBarTitleDisplayMode(.inline)
  }
}

private struct FlashcardView: View {
  let card: Card
  @State private var isFlipped = false

  var body: some View {
    VStack(spacing: 16) {
      if isFlipped {
        Text(card.definition).font(.title3)
        if !card.mnemonic.isEmpty {
          Label(card.mnemonic, systemImage: "lightbulb")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
      } else {
        Text(card.term).font(.largeTitle.bold())
      }
    }
    .multilineTextAlignment(.center)
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(.background.secondary, in: .rect(cornerRadius: 24))
    .contentShape(.rect)
    .onTapGesture { withAnimation(.snappy) { isFlipped.toggle() } }
    .accessibilityAddTraits(.isButton)
    .accessibilityHint(isFlipped ? "Shows the term" : "Shows the definition")
  }
}
