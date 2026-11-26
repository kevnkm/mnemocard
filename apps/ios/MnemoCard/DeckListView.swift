import SwiftUI

struct DeckListView: View {
  @Environment(DeckStore.self) private var store
  @State private var showingGenerator = false

  var body: some View {
    NavigationStack {
      Group {
        if store.decks.isEmpty {
          ContentUnavailableView {
            Label("No decks yet", systemImage: "rectangle.stack")
          } description: {
            Text("Generate a deck from any topic or your study notes.")
          } actions: {
            Button("Generate a deck") { showingGenerator = true }
              .buttonStyle(.borderedProminent)
          }
        } else {
          List {
            ForEach(store.decks) { deck in
              NavigationLink(value: deck) {
                VStack(alignment: .leading, spacing: 4) {
                  Text(deck.title).font(.headline)
                  Text("\(deck.cards.count) cards")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
              }
            }
            .onDelete(perform: store.delete)
          }
        }
      }
      .navigationTitle("MnemoCard")
      .navigationDestination(for: Deck.self) { DeckView(deck: $0) }
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button("Generate", systemImage: "sparkles") { showingGenerator = true }
        }
      }
      .sheet(isPresented: $showingGenerator) {
        GenerateDeckView()
      }
    }
  }
}

#Preview {
  DeckListView().environment(DeckStore())
}
