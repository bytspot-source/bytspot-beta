import SwiftUI

/// Discover is an invitation, never evidence of admission. Both surfaces may
/// read events.invite, but personal passes belong in the Profile flow.
struct NativePartyInvitationPresentation {
    let party: NativePartyPassRecord

    var entryTitle: String {
        switch NativePartyAccessMode(rawValue: party.accessMode) {
        case .freeRSVP: return "RSVP required"
        case .privateApproval: return "Host approval required"
        case .paidTicket: return "Ticket required"
        default: return "Entry details unavailable"
        }
    }

    var entryNote: String {
        switch NativePartyAccessMode(rawValue: party.accessMode) {
        case .freeRSVP: return "Viewing this invitation does not reserve a place."
        case .privateApproval: return "A request is not admission until the host approves it."
        case .paidTicket: return "Admission and any table or session are separate purchases."
        default: return "Check the entry requirements with the host before travelling."
        }
    }

    var scheduledDateLabel: String {
        guard let date = NativeAccountDeletionFormat.date(fromISO: party.scheduledDate) else {
            return party.scheduledDate
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    var capacityLabel: String {
        party.capacity > 0 ? "\(party.capacity) guests maximum" : "Capacity not supplied"
    }

    var locationLabel: String {
        // A display string must never override the disclosure policy.
        switch party.locationDisclosure {
        case "public": return party.locationLabel
        case "withheld": return "Location withheld by host"
        default: return "Location shared after approval"
        }
    }

    var membershipLabel: String? {
        switch BytspotTier(rawValue: party.requiredTier.lowercased()) {
        case .green: return nil
        case .platinum: return "Platinum membership required"
        case .black: return "Black membership required"
        default: return "Membership requirement unavailable"
        }
    }
}

/// Reject stale responses after account changes, retries, or dismissal.
struct NativePartyInvitationState {
    private(set) var generation = UUID()
    private(set) var partyID: String?
    private(set) var userID: String?
    private(set) var party: NativePartyPassRecord?
    private(set) var failed = false

    mutating func begin(partyID: String, userID: String?) -> UUID {
        invalidate()
        self.partyID = partyID
        self.userID = userID
        return generation
    }

    mutating func invalidate() {
        generation = UUID()
        party = nil
        failed = false
    }

    mutating func finish(_ party: NativePartyPassRecord?, generation: UUID) {
        guard generation == self.generation else { return }
        self.party = party?.id == partyID ? party : nil
        failed = self.party == nil
    }

    func record(partyID: String, userID: String?) -> NativePartyPassRecord? {
        guard partyID == self.partyID, userID == self.userID else { return nil }
        return party
    }
}

/// Main-app editorial detail, not the Clip's ticket/credential chassis.
/// No personal QR, recap, guest list, or implied reservation belongs here.
struct NativePartyInvitationDetail: View {
    let partyID: String
    var openAuth: (() -> Void)? = nil
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var state = NativePartyInvitationState()
    @State private var reloadID = UUID()
    @State private var shareMessage = ""

    private struct LoadKey: Equatable {
        let partyID: String
        let userID: String?
        let revision: UUID
    }

    private var loadKey: LoadKey {
        LoadKey(partyID: partyID, userID: sessionStore.authenticatedUserID, revision: reloadID)
    }

    private var party: NativePartyPassRecord? {
        state.record(partyID: partyID, userID: sessionStore.authenticatedUserID)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let party {
                    invitation(party)
                } else if state.failed {
                    unavailable
                } else {
                    ProgressView("Loading invitation…")
                        .frame(maxWidth: .infinity, minHeight: 240)
                }
            }
            .padding(20)
        }
        .foregroundColor(NativeTheme.textPrimary)
        .background(NativeDeepSpaceGround())
        .navigationTitle("Party details")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if let party { invitationActions(party) }
        }
        .task(id: loadKey) { await load() }
        .onChange(of: sessionStore.token) { _ in refresh() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { refresh() }
        }
        .onDisappear { state.invalidate() }
        .accessibilityIdentifier("native-party-invitation-detail")
    }

    private func invitation(_ party: NativePartyPassRecord) -> some View {
        let presentation = NativePartyInvitationPresentation(party: party)
        return VStack(alignment: .leading, spacing: 28) {
            artwork(party)
            VStack(alignment: .leading, spacing: 12) {
                Text("THE INVITATION").font(.caption.weight(.bold)).tracking(1.6)
                    .foregroundColor(NativeTheme.textSecondary)
                Text(party.title).font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text("Hosted by \(party.hostName)").font(.headline)
                    .foregroundColor(NativeTheme.textSecondary)
                if let tagline = party.tagline {
                    Text(tagline).font(.body).fixedSize(horizontal: false, vertical: true)
                }
            }
            section("At a glance") {
                fact("When", value: presentation.scheduledDateLabel, icon: "calendar")
                if let endsAt = party.endsAt {
                    fact("Ends", value: endsAt.formatted(date: .abbreviated, time: .shortened), icon: "clock")
                }
                fact("Where", value: presentation.locationLabel, icon: party.isLocationWithheld ? "lock" : "mappin.and.ellipse")
                fact("Entry", value: presentation.entryTitle, icon: "person.crop.circle")
                if let membership = presentation.membershipLabel {
                    fact("Membership", value: membership, icon: "person.crop.circle")
                }
                fact("Capacity", value: presentation.capacityLabel, icon: "person.3")
                Text(presentation.entryNote).font(.footnote).foregroundColor(NativeTheme.textSecondary)
            }
            section("Your host") {
                Text(party.hostName).font(.title3.bold())
                if let handle = party.hostHandle { Text(handle).font(.subheadline).foregroundColor(NativeTheme.textSecondary) }
                ForEach(party.hostDestinations) { destination in
                    Link(destination: destination.url) {
                        HStack(spacing: 12) {
                            Image(systemName: destination.kind.icon).frame(width: 24)
                            Text("\(destination.kind.title) · \(destination.label)").font(.body)
                            Spacer(minLength: 4)
                            Image(systemName: "arrow.up.right").font(.caption.weight(.bold))
                        }
                        .frame(minHeight: 44).contentShape(Rectangle())
                    }
                    .foregroundColor(NativeTheme.textPrimary)
                    .accessibilityLabel("Open \(destination.kind.title): \(destination.label)")
                }
            }
            if !party.runOfShow.isEmpty {
                section("The plan for the night") {
                    Text("Scheduled by the host").font(.footnote).foregroundColor(NativeTheme.textSecondary)
                    ForEach(party.runOfShow) { beat in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(beat.scheduledAt.formatted(date: .omitted, time: .shortened))
                                .font(.caption.weight(.semibold)).foregroundColor(NativeTheme.textSecondary)
                            Text(beat.title).font(.headline)
                        }
                        .padding(.vertical, 4).accessibilityElement(children: .combine)
                    }
                }
            }
            if !party.sessions.isEmpty {
                section("Tables & sessions") {
                    Text("Separate from admission. Prices and bottle terms are set by the seller.")
                        .font(.footnote).foregroundColor(NativeTheme.textSecondary)
                    ForEach(party.sessions) { session in
                        sessionCard(session, discloseLocation: !party.isLocationWithheld)
                    }
                }
            }
            Divider()
            NativePartyLineup(partyID: party.id)
            NativePartyCommerceControls(partyID: party.id, openAuth: openAuth)
                .id(party.id)
        }
    }

    private func artwork(_ party: NativePartyPassRecord) -> some View {
        GeometryReader { geometry in
            ZStack {
                Color.white.opacity(0.04)
                if let url = party.coverURL {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image { image.resizable().scaledToFit() }
                        else { artworkPlaceholder }
                    }
                } else { artworkPlaceholder }
            }
            .frame(width: geometry.size.width, height: geometry.size.height).clipped()
        }
        .aspectRatio(4 / 3, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityLabel("Event artwork for \(party.title)")
    }

    private var artworkPlaceholder: some View {
        VStack(spacing: 12) {
            Image(systemName: "calendar").font(.largeTitle)
            Text("Event artwork unavailable").font(.footnote)
        }
        .foregroundColor(NativeTheme.textSecondary)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Divider()
            Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func fact(_ title: String, value: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon).font(.body).frame(width: 24).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption).foregroundColor(NativeTheme.textSecondary)
                Text(value).font(.body.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func sessionCard(_ session: NativePartySessionOffer, discloseLocation: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(session.name).font(.headline)
            Text(session.priceLabel).font(.title3.weight(.semibold))
            if let bottles = session.bottleLabel { Text(bottles).font(.subheadline) }
            Text(session.startsAt.formatted(date: .abbreviated, time: .shortened)).font(.subheadline)
            if let end = session.endsAt {
                Text("Until \(end.formatted(date: .abbreviated, time: .shortened))").font(.subheadline)
            }
            if discloseLocation, let venue = session.venueName {
                Label(venue, systemImage: "mappin.and.ellipse").font(.subheadline)
            }
            Text(session.availabilityLabel).font(.footnote.weight(.semibold))
                .foregroundColor(NativeTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(16)
        .background(Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("native-invitation-session-\(session.id)")
    }

    private var unavailable: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Invitation unavailable").font(.title2.bold())
            Text("It may have ended or may no longer be shared. You can try again.")
                .font(.body).foregroundColor(NativeTheme.textSecondary)
            Button("Try again", action: refresh).frame(minHeight: 44)
        }
        .padding(.vertical, 40)
    }

    private func invitationActions(_ party: NativePartyPassRecord) -> some View {
        VStack(spacing: 10) {
            Button {
                guard let url = URL(string: "https://bytspot.app/party/\(party.id)") else { return }
                shareMessage = NativePartySharePresentation.share([url]) ? "" : "Sharing could not open. Please try again."
            } label: {
                Label("Share invitation", systemImage: "square.and.arrow.up")
                    .font(.headline).frame(maxWidth: .infinity, minHeight: 48)
                    .foregroundColor(NativeTheme.textPrimary)
                    .background(Color.white.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("native-party-share-invitation")
            Text("This is an invitation, not a personal door pass.")
                .font(.footnote).foregroundColor(NativeTheme.textSecondary).multilineTextAlignment(.center)
            if !shareMessage.isEmpty { Text(shareMessage).font(.footnote) }
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
        .background(NativeDeepSpaceGround())
    }

    private func refresh() {
        state.invalidate()
        shareMessage = ""
        reloadID = UUID()
    }

    @MainActor private func load() async {
        let key = loadKey
        let generation = state.begin(partyID: key.partyID, userID: key.userID)
        let token = sessionStore.canAttachBearerToken ? sessionStore.token : nil
        let client = BytspotAPIClient(tokenProvider: { token })
        let record = try? await NativePartyPassAPI(client: client).invite(partyID: key.partyID)
        guard !Task.isCancelled, loadKey == key else { return }
        state.finish(record, generation: generation)
    }
}
