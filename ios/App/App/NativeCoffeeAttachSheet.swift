import SwiftUI

/// Adding coffee to a Plan. Two writes stand behind one tap — a hold is asked
/// for, then the resulting reservation is attached to the Plan — so the sheet
/// owns the compensation: if the attach fails, the hold it just took is
/// released rather than left stranded with nothing pointing at it.
///
/// The button never says Book. A coffee reservation is a hold ask, and the
/// server derives its capability as `request`; the chrome here says the same
/// thing so the Plan row and this sheet cannot disagree.
struct NativeCoffeeAttachSheet: View {
    let planID: String
    let suggestedPartySize: Int?
    let suggestedTime: Date?
    @ObservedObject var sessionStore: BytspotSessionStore
    let onAttached: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var spots: [NativeCoffeeSpot] = []
    @State private var selectedSpotID: String?
    @State private var partySize: Int = 2
    @State private var requestedFor: Date = Date().addingTimeInterval(60 * 60)
    @State private var isLoading = false
    @State private var busy = false
    @State private var errorMessage: String?
    @State private var didPrefill = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if isLoading && spots.isEmpty {
                    ProgressView().tint(NativeTheme.textSecondary)
                } else if spots.isEmpty {
                    emptyState
                } else {
                    spotList
                    partySizeRow
                    timeRow
                    submitButton
                }
                if let errorMessage {
                    Text(errorMessage).font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.orange)
                }
            }
            .padding(20)
        }
        .accessibilityIdentifier("native-coffee-attach-\(planID)")
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Add coffee").font(.system(size: 22, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                Spacer()
                Button(action: { dismiss() }) { Image(systemName: "xmark.circle.fill").font(.system(size: 24, weight: .bold)).foregroundColor(NativeTheme.textSecondary) }
            }
            // Says exactly what the tap does. Bytspot asks the spot to keep a
            // table; the spot still has to answer, and no money moves.
            Text("Bytspot asks the spot to hold a table. They still have to say yes, and nothing is charged.")
                .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No coffee spots yet.").font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textPrimary)
            Text("Only spots Bytspot can actually hold a table at show up here, so this list stays short until more are live.")
                .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
        }
    }

    private var spotList: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Where")
            ForEach(spots) { spot in
                Button(action: { selectedSpotID = spot.id }) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(spot.name).font(.system(size: 14, weight: .bold)).foregroundColor(NativeTheme.textPrimary)
                            Text(NativeCoffeeDisplay.spotSubtitle(areaLabel: spot.areaLabel, holdMinutes: spot.holdMinutes))
                                .font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                        }
                        Spacer()
                        // The chip states the only thing this rail can do.
                        Text("Request").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(NativeTheme.purple.opacity(0.25))
                            .clipShape(Capsule())
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(selectedSpotID == spot.id ? NativeTheme.purple.opacity(0.22) : Color.white.opacity(0.06))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-coffee-spot-\(spot.id)")
            }
        }
    }

    private var partySizeRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("How many")
            // Eight is the server's ceiling for a held table; the stepper
            // cannot ask for a size the router would refuse.
            Stepper(value: $partySize, in: 1...8) {
                Text("\(partySize) \(partySize == 1 ? "person" : "people")")
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textPrimary)
            }
            .accessibilityIdentifier("native-coffee-party-size")
        }
    }

    private var timeRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("When")
            DatePicker("", selection: $requestedFor, in: Date()...Date().addingTimeInterval(30 * 24 * 60 * 60))
                .datePickerStyle(.compact)
                .labelsHidden()
                .accessibilityIdentifier("native-coffee-requested-for")
        }
    }

    private var submitButton: some View {
        Button(action: { Task { await submit() } }) {
            Text(busy ? "Working…" : "Request a table")
                .font(.system(size: 14, weight: .black)).foregroundColor(.white)
                .frame(maxWidth: .infinity).padding(.vertical, 12)
                .background(selectedSpotID == nil ? NativeTheme.purple.opacity(0.35) : NativeTheme.purple)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(busy || selectedSpotID == nil)
        .accessibilityIdentifier("native-coffee-request")
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased()).font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textTertiary).tracking(1.2)
    }

    private func api() -> NativeCoffeeAPI {
        NativeCoffeeAPI(client: BytspotAPIClient(tokenProvider: { [weak sessionStore] in sessionStore?.token }))
    }

    private func planAPI() -> NativePlanAPI {
        NativePlanAPI(client: BytspotAPIClient(tokenProvider: { [weak sessionStore] in sessionStore?.token }))
    }

    private func load() async {
        if !didPrefill {
            didPrefill = true
            if let suggestedPartySize { partySize = min(max(suggestedPartySize, 1), 8) }
            // A Plan with a start time is the time the caller already picked;
            // only a Plan without one falls back to "an hour from now".
            if let suggestedTime, suggestedTime > Date() { requestedFor = suggestedTime }
        }
        isLoading = true; defer { isLoading = false }
        do {
            spots = try await api().list()
            errorMessage = nil
        } catch {
            errorMessage = "Couldn’t load coffee spots."
        }
    }

    private func submit() async {
        guard let spotID = selectedSpotID else { return }
        guard sessionStore.canAttachBearerToken else { errorMessage = "Sign in to request a table."; return }
        busy = true; defer { busy = false }

        let reservation: NativeCoffeeReservation
        do {
            reservation = try await api().createReservation(
                spotID: spotID,
                idempotencyKey: UUID().uuidString,
                partySize: partySize,
                requestedFor: requestedFor
            )
        } catch {
            errorMessage = NativeCoffeeDisplay.failureMessage(for: error)
            return
        }

        do {
            try await planAPI().attachCoffeeReservation(planID: planID, reservationID: reservation.id)
        } catch {
            // The hold exists but nothing points at it. Release it rather than
            // leaving a table held for a Plan that never got the item.
            try? await api().cancelReservation(reservation.id)
            errorMessage = NativeCoffeeDisplay.failureMessage(for: error)
            return
        }

        errorMessage = nil
        onAttached()
        dismiss()
    }
}

extension NativeCoffeeDisplay {
    /// App-authored failure copy. Server messages are not echoed, so a wording
    /// change on the API can never rewrite what a Bytspot surface promises.
    static func failureMessage(for error: Error) -> String {
        if let urlError = error as? URLError,
           [.timedOut, .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost].contains(urlError.code) {
            return "We couldn’t connect. Check your internet and try again."
        }
        guard case let BytspotAPIClient.APIError.server(status, _) = error else { return "That didn’t go through." }
        switch status {
        case 400: return "Pick a time in the next few weeks."
        case 404: return "That spot isn’t taking holds right now."
        case 409: return "You already have a live hold here."
        case 429: return "Too many requests. Wait a moment and try again."
        default: return "That didn’t go through."
        }
    }
}
