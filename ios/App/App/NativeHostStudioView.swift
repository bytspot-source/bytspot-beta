import SwiftUI
import UIKit
import PhotosUI

struct NativePartyPassPresentation {
    private(set) var party: NativePublishedParty?
    var message = ""

    var isPartyPassVisible: Bool { party != nil }

    mutating func completePublish(with party: NativePublishedParty) {
        self.party = party
        message = ""
    }

    mutating func completeArrivalLookupFailure() {
        guard party != nil else { return }
        message = ""
    }
}

/// The disclosure step can write the door, so the rule for when that write is
/// attributed lives here as pure state rather than inside the view, where it
/// could only be checked by eye.
enum NativeHostDoorAttribution {
    struct State: Equatable {
        var accessMode: NativePartyAccessMode
        var setByDisclosure: Bool
    }

    /// Only `afterApproval` can move the door, and only a move it actually made
    /// is attributed. A host already on Private Approval is left alone.
    static func applyDisclosure(_ disclosure: NativePartyLocationDisclosure, to state: State) -> State {
        guard disclosure == .afterApproval else {
            return State(accessMode: state.accessMode, setByDisclosure: false)
        }
        guard state.accessMode != .privateApproval else { return state }
        return State(accessMode: .privateApproval, setByDisclosure: true)
    }

    /// A door the host picked is theirs, so it is never attributed elsewhere.
    static func applyHostChoice(_ mode: NativePartyAccessMode) -> State {
        State(accessMode: mode, setByDisclosure: false)
    }

    /// The note explains a choice the host did not make. It must not appear over
    /// a Private Approval door the host selected themselves.
    static func showsAttribution(_ state: State) -> Bool {
        state.setByDisclosure && state.accessMode == .privateApproval
    }
}

@MainActor
enum NativePartySharePresentation {
    static func activityController(for items: [Any], presenter: UIViewController) -> UIActivityViewController {
        let activityController = UIActivityViewController(activityItems: items, applicationActivities: nil)
        if let popover = activityController.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = presenter.view.bounds
            popover.permittedArrowDirections = []
        }
        return activityController
    }

    static func activityController(for url: URL, presenter: UIViewController) -> UIActivityViewController {
        activityController(for: [url], presenter: presenter)
    }

    /// Host Studio lives inside presented sheets, so presenting the share
    /// sheet from the window's root fails silently ("already presenting").
    /// Walk to the topmost presented controller and present from there.
    static func topPresenter() -> UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }) ?? UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController else { return nil }
        var top = root
        while let presented = top.presentedViewController, !presented.isBeingDismissed { top = presented }
        return top
    }

    static func share(_ items: [Any]) -> Bool {
        guard let presenter = topPresenter() else { return false }
        presenter.present(activityController(for: items, presenter: presenter), animated: true)
        return true
    }
}

struct NativeHostStudioView: View {
    private enum Step: Int, CaseIterable { case spark, build, door, invite }

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    let circles: [NativeSocialCircle]
    let membershipTier: BytspotTier

    @State private var step: Step = .spark
    @State private var taxonomy = NativeHostTaxonomySelection.default
    @State private var templateID: NativePartyTemplateID = NativeHostTaxonomySelection.default.type.printer
    @State private var title = ""
    @State private var tagline = "One moment. Your people."
    @State private var startsAt = Self.defaultStart
    @State private var beatOffsets: [Int] = []
    @State private var hostSetsEnd = false
    @State private var endsAt = Self.defaultStart.addingTimeInterval(3 * 60 * 60)
    @State private var venueName = ""
    @State private var capacity = "\(NativeHostTaxonomySelection.recommendedCapacity)"
    @State private var accessMode: NativePartyAccessMode = .privateApproval
    @State private var requiredTier: BytspotTier = .green
    @State private var ticketPrice = "25"
    @State private var selectedCircleIDs: Set<String> = []
    @State private var teammateEmail = ""
    @State private var teammateRole: NativePartyHostRole = .cohost
    @State private var listeningFormat: NativeListeningPartyFormat = .listeningSession
    @State private var fanMeetupFormat: NativeFanMeetupFormat = .meetAndGreet
    @State private var releaseFormat: NativeReleaseFormat = .single
    @State private var releaseTitle = ""
    @State private var locationDisclosure: NativePartyLocationDisclosure = .public
    /// True while the door reflects a write made by the disclosure picker rather
    /// than by the host, so the door step can say why it changed.
    @State private var doorSetByDisclosure = false
    @State private var hostIdentity = NativeHostIdentity.empty
    @State private var loadedProfileDestinations = false
    /// True only after a successful profile fetch. A failed load must never
    /// persist an empty list over an existing profile.
    @State private var didLoadHostIdentity = false
    @State private var privateGuestPolicy: NativePrivatePartyGuestPolicy = .namedGuests
    @State private var isPublishing = false
    @State private var publishPresentation = NativePartyPassPresentation()
    @State private var publishTask: Task<Void, Never>?
    @State private var publishStage = "draft"
    @State private var idempotencyKey = UUID().uuidString.lowercased()
    @State private var coverMedia: NativePartyPendingImage?
    @State private var albumMedia: [NativePartyPendingImage] = []
    @State private var showCoverPicker = false
    @State private var showAlbumPicker = false
    @State private var arrivalVenueCandidates: [NativePartyArrivalVenue] = []
    @State private var boundArrivalVenueID: String?
    @State private var isLoadingArrivalVenues = false
    @State private var isBindingArrivalDestination = false
    @State private var showingPartyControl = false

    private static var defaultStart: Date {
        Calendar.current.date(bySettingHour: 20, minute: 0, second: 0, of: Date().addingTimeInterval(86_400)) ?? Date().addingTimeInterval(86_400)
    }

    private var template: NativePartyTemplate {
        NativePartyTemplate.catalog.first { $0.id == templateID } ?? NativePartyTemplate.catalog[0]
    }

    private var displayTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? template.name : title }

    /// Wizard accent follows the selected party tier from step 1 through publish.
    /// Reuses the shared checkout/pass palette in BytspotTheme so hosts see the
    /// same tier tokens guests will see on the Party Pass.
    private var tierAccent: Color { BytspotTheme.accent(for: requiredTier) }

    var body: some View {
        ZStack {
            BytspotNativeBackground(tier: requiredTier).ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if let party = publishPresentation.party { partyPass(party) }
                else { studio }
            }
        }
        .preferredColorScheme(.dark)
        .accessibilityIdentifier("native-host-studio")
        .onChange(of: sessionStore.token ?? "") { _ in
            guard isPublishing else { return }
            publishTask?.cancel()
            isPublishing = false
            publishPresentation.message = NativePartyStudioError.sessionChanged.localizedDescription
        }
        .onDisappear { publishTask?.cancel() }
        .sheet(isPresented: $showCoverPicker) {
            NativePartyPhotoPicker(selectionLimit: 1) { images in setCoverImage(images.first) }
        }
        .sheet(isPresented: $showAlbumPicker) {
            NativePartyPhotoPicker(selectionLimit: max(1, 6 - albumMedia.count)) { images in addAlbumImages(images) }
        }
        .sheet(isPresented: $showingPartyControl) {
            if let party = publishPresentation.party { NativePartyControlView(partyID: party.id).environmentObject(sessionStore) }
        }
    }

    private var header: some View {
        HStack {
            Button(action: { dismiss() }) { Label("Network", systemImage: "chevron.left").font(.system(size: 14, weight: .bold)) }
                .buttonStyle(.plain).foregroundColor(.white)
            Spacer()
            VStack(spacing: 1) {
                Text("HOST STUDIO").font(.system(size: 10, weight: .black)).tracking(1.8).foregroundColor(NativeTheme.pink)
                Text("The backstage").font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.52))
            }
            Spacer()
            Text("\(requiredTier.displayName.uppercased()) TIER").font(.system(size: 9, weight: .black)).foregroundColor(tierAccent).padding(.horizontal, 9).frame(height: 28).background(tierAccent.opacity(0.13)).clipShape(Capsule()).accessibilityLabel("Party tier \(requiredTier.displayName)")
        }
        .padding(.horizontal, 18).frame(height: 58).background(Color.black.opacity(0.72))
    }

    private var studio: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                progress
                hero
                stepContent
                if !publishPresentation.message.isEmpty { Text(publishPresentation.message).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.orange).accessibilityIdentifier("native-host-studio-message") }
                navigationButtons
            }
            .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 34)
        }
    }

    private var progress: some View {
        HStack(spacing: 7) {
            ForEach(Array(Step.allCases.enumerated()), id: \.offset) { index, item in
                VStack(spacing: 5) {
                    Capsule().fill(index <= step.rawValue ? tierAccent : Color.white.opacity(0.12)).frame(height: 4)
                    Text(["Spark", "Build", "Door", "Invite"][index]).font(.system(size: 9.5, weight: .bold)).foregroundColor(item == step ? .white : .white.opacity(0.38))
                }
            }
        }.accessibilityElement(children: .combine).accessibilityLabel("Host Studio step \(step.rawValue + 1) of 4")
    }

    private var hero: some View {
        ZStack(alignment: .topTrailing) {
            templateGradient
            Text(template.emoji).font(.system(size: 88)).opacity(0.17).offset(x: 13, y: -18)
            VStack(alignment: .leading, spacing: 9) {
                Text("BYTSPOT PRESENTS").font(.system(size: 9.5, weight: .black)).tracking(1.7).foregroundColor(.white.opacity(0.65))
                Spacer(minLength: 18)
                Text(displayTitle).font(.system(size: 29, weight: .black, design: .rounded)).lineLimit(2).minimumScaleFactor(0.78)
                Text(tagline.isEmpty ? template.hook : tagline).font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white.opacity(0.74)).lineLimit(2)
                HStack(spacing: 7) { heroChip(requiredTier.displayName); heroChip(accessMode.title); heroChip(startsAt.formatted(date: .abbreviated, time: .shortened)) }
            }.padding(21)
        }
        .frame(minHeight: 210).clipShape(RoundedRectangle(cornerRadius: 29, style: .continuous)).shadow(color: NativeTheme.purple.opacity(0.22), radius: 22, y: 12)
    }

    private var templateGradient: some View {
        let colors: [Color]
        switch templateID {
        case .listeningParty: colors = [NativeTheme.pink, NativeTheme.purple900, NativeTheme.slate950]
        case .comedyNight: colors = [NativeTheme.orange, Color.red.opacity(0.62), NativeTheme.slate950]
        case .premiere: colors = [NativeTheme.cyan, Color.blue.opacity(0.72), NativeTheme.slate950]
        case .privateParty: colors = [NativeTheme.emerald, NativeTheme.green900, NativeTheme.slate950]
        case .fanMeetup: colors = [NativeTheme.purple, Color.indigo, NativeTheme.slate950]
        case .releaseParty: colors = [NativeTheme.pink, Color.red.opacity(0.60), NativeTheme.slate950]
        case .popUp: colors = [NativeTheme.orange, NativeTheme.purple900, NativeTheme.slate950]
        }
        return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private func heroChip(_ text: String) -> some View {
        Text(text.uppercased()).font(.system(size: 8.5, weight: .black)).lineLimit(1).padding(.horizontal, 8).frame(height: 25).background(Color.black.opacity(0.31)).clipShape(Capsule())
    }

    @ViewBuilder private var stepContent: some View {
        switch step {
        case .spark: sparkContent
        case .build: buildContent
        case .door: doorContent
        case .invite: inviteContent
        }
    }

    private var sparkContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeading("SPARK THE VIBE", "What kind of night?", "Pick a category. Then a type. Same room printer.")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(NativeHostCategory.allCases) { category in
                    Button(action: { nativeImpactLight(); selectCategory(category) }) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(category.emoji).font(.system(size: 27)); Text(category.title).font(.system(size: 14, weight: .black)); Text(category.hook).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.55)).lineLimit(2)
                        }.frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading).padding(13).background(taxonomy.category == category ? tierAccent.opacity(0.16) : Color.white.opacity(0.055)).overlay(RoundedRectangle(cornerRadius: 19).stroke(taxonomy.category == category ? tierAccent : Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 19))
                    }.buttonStyle(.plain).accessibilityLabel(category.title)
                }
            }
            VStack(alignment: .leading, spacing: 9) {
                Text("TYPE").studioLabel()
                Text("This is a tag. The door is still RSVP, ticket, or approval.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(NativeHostType.types(in: taxonomy.category)) { type in
                        Button(action: { nativeImpactLight(); selectType(type) }) {
                            Text(type.name)
                                .font(.system(size: 12, weight: .black))
                                .frame(maxWidth: .infinity, minHeight: 38)
                                .foregroundColor(taxonomy.type.id == type.id ? .black : .white)
                                .background(taxonomy.type.id == type.id ? Color.white : Color.white.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }.buttonStyle(.plain).accessibilityLabel(type.name)
                    }
                }
            }.padding(14).studioSurface()
            VStack(alignment: .leading, spacing: 9) {
                Text("FORMAT · OPTIONAL").studioLabel()
                taxonomyChipRow(titles: NativeHostFormat.allCases.map(\.title), selected: taxonomy.format?.title) { title in
                    let format = NativeHostFormat.allCases.first { $0.title == title }
                    taxonomy.format = taxonomy.format == format ? nil : format
                }
                Text("AGE · OPTIONAL").studioLabel()
                taxonomyChipRow(titles: NativeHostAgeRule.allCases.map(\.title), selected: taxonomy.age?.title) { title in
                    let age = NativeHostAgeRule.allCases.first { $0.title == title }
                    taxonomy.age = taxonomy.age == age ? nil : age
                }
            }.padding(14).studioSurface()
            VStack(alignment: .leading, spacing: 9) {
                Text("PARTY TIER").studioLabel()
                HStack(spacing: 7) {
                    ForEach([BytspotTier.green, .platinum, .black], id: \.rawValue) { tier in tierOptionCard(tier) }
                }
                Text("The studio re-skins to the selected tier instantly. The same palette follows this Party to its pass and checkout.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            }.padding(14).studioSurface()
        }
    }

    private func tierOptionCard(_ tier: BytspotTier) -> some View {
        let accent = BytspotTheme.accent(for: tier)
        let selected = requiredTier == tier
        return Button(action: { nativeImpactLight(); requiredTier = tier }) {
            Text(tier.displayName)
                .font(.system(size: 11, weight: .black))
                .foregroundColor(selected ? (tier == .black ? accent : .black) : accent)
                .frame(maxWidth: .infinity).frame(height: 38)
                .background(tierOptionBackground(tier, selected: selected))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? accent : accent.opacity(0.30)))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain).accessibilityLabel("\(tier.displayName) tier")
    }

    /// Tier-shaped option surfaces: Green = emerald fill, Platinum = silver/light
    /// gradient over the cyan token, Black = OLED deep black with the amber accent.
    @ViewBuilder private func tierOptionBackground(_ tier: BytspotTier, selected: Bool) -> some View {
        if !selected {
            BytspotTheme.accent(for: tier).opacity(0.10)
        } else {
            switch tier {
            case .green: BytspotTheme.accent(for: .green)
            case .platinum: LinearGradient(colors: [Color.white, BytspotTheme.accent(for: .platinum).opacity(0.85)], startPoint: .topLeading, endPoint: .bottomTrailing)
            case .black: NativeTheme.slate950
            }
        }
    }

    private var buildContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeading("BUILD THE MOMENT", "Make it yours.", "Name the night, set the place, and shape the run of show.")
            field("Party title", text: $title, icon: "sparkles", prompt: "Give the night a name")
            field("Party tagline", text: $tagline, icon: "quote.bubble.fill", prompt: "One-line hook")
            templateConfigurationEditor
            partyMediaEditor
            DatePicker("Party date and time", selection: $startsAt, displayedComponents: [.date, .hourAndMinute]).font(.system(size: 13, weight: .bold)).padding(13).studioSurface()
            field("Party venue", text: $venueName, icon: "mappin.and.ellipse", prompt: "Venue or secret location")
            locationDisclosureEditor
            officialDestinationsEditor
            runOfShowEditor
        }
    }

    @ViewBuilder private var templateConfigurationEditor: some View {
        switch templateID {
        case .listeningParty:
            templatePicker("MUSIC FORMAT", selection: $listeningFormat, options: NativeListeningPartyFormat.allCases)
        case .fanMeetup:
            templatePicker("MEETUP FORMAT", selection: $fanMeetupFormat, options: NativeFanMeetupFormat.allCases)
        case .releaseParty:
            VStack(alignment: .leading, spacing: 10) {
                templatePicker("RELEASE FORMAT", selection: $releaseFormat, options: NativeReleaseFormat.allCases)
                field("Release title", text: $releaseTitle, icon: "music.note.list", prompt: "Single, album, mix, or video title")
            }.padding(14).studioSurface()
        case .popUp:
            VStack(alignment: .leading, spacing: 7) {
                Text("POP-UP LOCATION").studioLabel()
                Text(locationDisclosure.recipientExplanation).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            }.padding(14).studioSurface()
        case .privateParty:
            VStack(alignment: .leading, spacing: 7) {
                templatePicker("GUEST LIST", selection: $privateGuestPolicy, options: NativePrivatePartyGuestPolicy.allCases)
                Text("Private Parties always use host approval. Named guest enforcement is introduced with the authorized guest action.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            }.padding(14).studioSurface()
        case .comedyNight, .premiere:
            EmptyView()
        }
    }

    private var locationDisclosureEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            templatePicker("LOCATION ON PARTY PASS", selection: $locationDisclosure, options: NativePartyLocationDisclosure.allCases)
            Text(locationDisclosure.recipientExplanation).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
        }
        .padding(14).studioSurface()
        // Selecting "After approval" moves the door to Private Approval because
        // only that mode has an approver. The write is recorded so the door step
        // can attribute it, rather than the host finding a choice they did not
        // make already selected.
        .onChange(of: locationDisclosure) { disclosure in
            let next = NativeHostDoorAttribution.applyDisclosure(
                disclosure,
                to: .init(accessMode: accessMode, setByDisclosure: doorSetByDisclosure),
            )
            accessMode = next.accessMode
            doorSetByDisclosure = next.setByDisclosure
        }
    }

    /// Editable Run of Show: each beat gets a wall-clock time picker on the
    /// existing party clock (offsets roll to the next day for all-day rooms),
    /// plus an optional host-set end. No second clock, no cron.
    private var runOfShowEditor: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("RUN OF SHOW").studioLabel()
            Text("Times ride the party clock. A beat earlier than the start rolls to the next day.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            ForEach(Array(template.itinerary.enumerated()), id: \.offset) { index, item in
                HStack(spacing: 10) {
                    Text("\(index + 1)").font(.system(size: 10, weight: .black)).foregroundColor(.black).frame(width: 23, height: 23).background(NativeTheme.cyan).clipShape(Circle())
                    Text(item).font(.system(size: 12.5, weight: .bold))
                    Spacer()
                    DatePicker("", selection: beatTimeBinding(index), displayedComponents: [.hourAndMinute])
                        .labelsHidden()
                        .accessibilityLabel("\(item) time")
                }
            }
            Toggle(isOn: $hostSetsEnd.animation(.easeInOut(duration: 0.15))) {
                Text("SET PARTY END").studioLabel()
            }
            .tint(NativeTheme.cyan)
            if hostSetsEnd {
                DatePicker("Party ends", selection: $endsAt, in: startsAt.addingTimeInterval(15 * 60)..., displayedComponents: [.date, .hourAndMinute]).font(.system(size: 13, weight: .bold))
            } else {
                Text("No end set: the party closes one hour after the last beat.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            }
        }.padding(14).studioSurface()
    }

    private func beatTimeBinding(_ index: Int) -> Binding<Date> {
        Binding(
            get: { NativeRunOfShowSchedule.beatDate(offsetMinutes: currentBeatOffsets[index], startsAt: startsAt) },
            set: { picked in
                var offsets = currentBeatOffsets
                offsets[index] = NativeRunOfShowSchedule.offsetMinutes(pickedTime: picked, startsAt: startsAt)
                beatOffsets = offsets
            }
        )
    }

    /// Falls back to the template's hourly cadence until the host edits a beat
    /// or the template (and its beat count) changes.
    private var currentBeatOffsets: [Int] {
        beatOffsets.count == template.itinerary.count ? beatOffsets : template.itinerary.indices.map { $0 * 60 }
    }

    /// Official Host identity editor. Horizontal pill scroll: tap adds a
    /// destination (selected state), tap again removes it. Added destinations
    /// list vertically below — reorder with arrows, star one as Primary ⭐.
    /// Socials take handles; Bytspot owns the routing. No URLs in public UI.
    private var officialDestinationsEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("OFFICIAL HOST DESTINATIONS").studioLabel()
            Text("Saved to your host profile. Tap to add, tap again to remove. Guests see your verified host name — never a link.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(NativeHostDestinationKind.allCases) { kind in destinationPill(kind) }
                }
            }
            ForEach(Array(hostIdentity.destinations.enumerated()), id: \.element.id) { index, destination in
                destinationRow(index: index, destination: destination)
            }
        }.padding(14).studioSurface()
            .task { await prefillHostIdentity() }
    }

    private func destinationPill(_ kind: NativeHostDestinationKind) -> some View {
        let isOn = hostIdentity.destinations.contains { $0.kind == kind }
        return Button(action: { toggleDestination(kind) }) {
            Label(kind.title, systemImage: kind.icon)
                .font(.system(size: 12, weight: .black))
                .foregroundColor(isOn ? .black : .white.opacity(0.72))
                .padding(.horizontal, 13).frame(height: 34)
                .background(isOn ? NativeTheme.cyan : Color.white.opacity(0.08))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(kind.title) destination")
        .accessibilityValue(isOn ? "Added" : "Not added")
        .accessibilityHint(isOn ? "Removes this destination." : "Adds this destination.")
    }

    @ViewBuilder private func destinationRow(index: Int, destination: NativeHostIdentityDestination) -> some View {
        HStack(spacing: 8) {
            field(destination.kind.title, text: destinationValueBinding(destination.kind), icon: destination.kind.icon, prompt: destination.kind.fieldPrompt, keyboard: destination.kind.isSocial ? .default : .URL)
            Button(action: { setPrimary(destination.kind) }) {
                Image(systemName: destination.primary ? "star.fill" : "star")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(destination.primary ? NativeTheme.cyan : .white.opacity(0.35))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(destination.kind.title) primary")
            .accessibilityValue(destination.primary ? "Primary" : "Not primary")
            VStack(spacing: 3) {
                Button(action: { moveDestination(destination.kind, by: -1) }) { Image(systemName: "chevron.up").font(.system(size: 11, weight: .black)).foregroundColor(index == 0 ? .white.opacity(0.18) : .white.opacity(0.6)) }
                    .buttonStyle(.plain).disabled(index == 0)
                    .accessibilityLabel("Move \(destination.kind.title) up")
                Button(action: { moveDestination(destination.kind, by: 1) }) { Image(systemName: "chevron.down").font(.system(size: 11, weight: .black)).foregroundColor(index == hostIdentity.destinations.count - 1 ? .white.opacity(0.18) : .white.opacity(0.6)) }
                    .buttonStyle(.plain).disabled(index == hostIdentity.destinations.count - 1)
                    .accessibilityLabel("Move \(destination.kind.title) down")
            }
        }
    }

    private func destinationValueBinding(_ kind: NativeHostDestinationKind) -> Binding<String> {
        Binding(
            get: { hostIdentity.destinations.first { $0.kind == kind }?.value ?? "" },
            set: { value in
                if let index = hostIdentity.destinations.firstIndex(where: { $0.kind == kind }) { hostIdentity.destinations[index].value = value }
            }
        )
    }

    private func toggleDestination(_ kind: NativeHostDestinationKind) {
        if let index = hostIdentity.destinations.firstIndex(where: { $0.kind == kind }) {
            hostIdentity.destinations.remove(at: index)
        } else {
            hostIdentity.destinations.append(NativeHostIdentityDestination(kind: kind, value: "", primary: false))
        }
    }

    private func setPrimary(_ kind: NativeHostDestinationKind) {
        for index in hostIdentity.destinations.indices {
            let isTarget = hostIdentity.destinations[index].kind == kind
            hostIdentity.destinations[index].primary = isTarget ? !hostIdentity.destinations[index].primary : false
        }
    }

    private func moveDestination(_ kind: NativeHostDestinationKind, by delta: Int) {
        guard let index = hostIdentity.destinations.firstIndex(where: { $0.kind == kind }) else { return }
        let target = index + delta
        guard hostIdentity.destinations.indices.contains(target) else { return }
        hostIdentity.destinations.swapAt(index, target)
    }

    private func prefillHostIdentity() async {
        guard !loadedProfileDestinations, sessionStore.canAttachBearerToken, let token = sessionStore.token else { return }
        loadedProfileDestinations = true
        guard let saved = try? await NativePartyStudioAPI(client: BytspotAPIClient(tokenProvider: { token })).loadHostIdentity() else { return }
        didLoadHostIdentity = true
        if hostIdentity == .empty { hostIdentity = saved }
    }

    private func templatePicker<T: CaseIterable & Identifiable & Hashable>(_ label: String, selection: Binding<T>, options: T.AllCases) -> some View where T.ID == String, T: RawRepresentable, T.RawValue == String {
        VStack(alignment: .leading, spacing: 7) {
            Text(label).studioLabel()
            Picker(label, selection: selection) {
                ForEach(Array(options), id: \.id) { option in Text(templateOptionTitle(option)).tag(option) }
            }.pickerStyle(.segmented)
        }
    }

    private func templateOptionTitle<T: RawRepresentable>(_ option: T) -> String where T.RawValue == String {
        switch option.rawValue {
        case "listening-session": return "Listen"
        case "dj-mix-premiere": return "DJ mix"
        case "live-performance": return "Live set"
        case "label-showcase": return "Label"
        case "meet-and-greet": return "Meet & greet"
        case "creator-conversation": return "Conversation"
        case "community-photo": return "Photo moment"
        case "after-approval": return "After approval"
        case "withheld": return "Withheld"
        case "named-guests": return "Named guests"
        case "named-guests-plus-one": return "Named + one"
        case "ep": return "EP"
        default: return option.rawValue.capitalized
        }
    }

    private var partyMediaEditor: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("PARTY MEDIA").studioLabel()
                    Text("Cover poster + album").font(.system(size: 14, weight: .black))
                }
                Spacer()
                Text("HOST CONTROLLED").font(.system(size: 8.5, weight: .black)).foregroundColor(NativeTheme.emerald)
            }
            Button(action: { showCoverPicker = true }) {
                ZStack {
                    if let coverMedia {
                        Image(uiImage: coverMedia.preview).resizable().scaledToFill()
                    } else {
                        LinearGradient(colors: [NativeTheme.purple.opacity(0.7), NativeTheme.cyan.opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        Label("Choose cover poster", systemImage: "photo.badge.plus").font(.system(size: 13, weight: .black))
                    }
                }
                .frame(maxWidth: .infinity).frame(height: 132).clipped().clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.15)))
            }.buttonStyle(.plain)
            HStack {
                Text("PARTY ALBUM · \(albumMedia.count)/6").studioLabel()
                Spacer()
                if albumMedia.count < 6 {
                    Button("Add photos") { showAlbumPicker = true }.font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.cyan)
                }
            }
            if !albumMedia.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 9) {
                        ForEach(albumMedia) { media in
                            Image(uiImage: media.preview).resizable().scaledToFill().frame(width: 72, height: 88).clipped().clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(alignment: .topTrailing) { Button(action: { albumMedia.removeAll { $0.id == media.id } }) { Image(systemName: "xmark.circle.fill").foregroundColor(.white).background(Circle().fill(.black)) }.offset(x: 5, y: -5) }
                        }
                    }.padding(.vertical, 5)
                }
            } else {
                Text("Only photos selected here appear in the Party Pass.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.48))
            }
        }.padding(14).studioSurface()
    }

    private var doorContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeading("SET THE DOOR", "Who gets in?", "Choose RSVP, a paid first drop, or host approval.")
            ForEach(templateConfiguration.allowedAccessModes) { mode in
                Button(action: {
                    let next = NativeHostDoorAttribution.applyHostChoice(mode)
                    accessMode = next.accessMode
                    doorSetByDisclosure = next.setByDisclosure
                }) {
                    HStack(spacing: 12) { Image(systemName: mode == .paidTicket ? "ticket.fill" : mode == .privateApproval ? "lock.fill" : "person.badge.plus").foregroundColor(tierAccent); VStack(alignment: .leading) { Text(mode.title).font(.system(size: 14, weight: .black)); Text(accessDetail(mode)).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.5)) }; Spacer(); Image(systemName: accessMode == mode ? "checkmark.circle.fill" : "circle").foregroundColor(accessMode == mode ? NativeTheme.emerald : .white.opacity(0.25)) }.padding(14).studioSurface(selected: accessMode == mode, accent: tierAccent)
                }.buttonStyle(.plain)
            }
            if locationDisclosure == .afterApproval && accessMode != .privateApproval {
                Label("Location is set to \u{201C}After approval\u{201D} on the location step. Only Private Approval can reveal it.", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(NativeTheme.orange)
                    .padding(12).studioSurface()
                    .accessibilityIdentifier("native-host-studio-disclosure-conflict")
            } else if NativeHostDoorAttribution.showsAttribution(.init(accessMode: accessMode, setByDisclosure: doorSetByDisclosure)) {
                Label("Set to Private Approval because your location is revealed after approval. Change either one.", systemImage: "info.circle.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(NativeTheme.cyan)
                    .padding(12).studioSurface()
                    .accessibilityIdentifier("native-host-studio-door-auto-set")
            }
            if accessMode == .paidTicket { field("First Drop price", text: $ticketPrice, icon: "dollarsign.circle.fill", prompt: "25", keyboard: .decimalPad) }
            field("Capacity", text: $capacity, icon: "person.3.fill", prompt: "\(NativeHostTaxonomySelection.recommendedCapacity)", keyboard: .numberPad)
            VStack(alignment: .leading, spacing: 9) {
                Text("MINIMUM MEMBERSHIP").studioLabel()
                HStack(spacing: 7) {
                    ForEach([BytspotTier.green, .platinum, .black], id: \.rawValue) { tier in tierOptionCard(tier) }
                }
            }.padding(14).studioSurface()
        }
    }

    private var inviteContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeading("INVITE YOUR PEOPLE", "Build the room.", "Choose Circles, add a teammate, then drop the Party Pass.")
            VStack(alignment: .leading, spacing: 10) {
                Label("Audience Circles", systemImage: "person.3.fill").font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.cyan)
                if circles.isEmpty { Text("No synced Circles yet. Your share link still works anywhere.").font(.system(size: 11.5, weight: .semibold)).foregroundColor(.white.opacity(0.5)) }
                else { ForEach(circles) { circle in circleButton(circle) } }
            }.padding(14).studioSurface()
            VStack(alignment: .leading, spacing: 10) {
                Text("BACKSTAGE TEAMMATE · OPTIONAL").studioLabel()
                field("Co-host email", text: $teammateEmail, icon: "person.badge.key.fill", prompt: "name@email.com", keyboard: .emailAddress)
                Picker("Co-host role", selection: $teammateRole) { ForEach([NativePartyHostRole.cohost, .door, .finance]) { role in Text(role.title).tag(role) } }.pickerStyle(.segmented)
                Text(roleSummary).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.48))
            }.padding(14).studioSurface()
            Label("Itinerary · RSVP · ticketing · payments · check-in · role-scoped controls", systemImage: "checkmark.shield.fill").font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.emerald).padding(14).studioSurface()
        }
    }

    private func circleButton(_ circle: NativeSocialCircle) -> some View {
        Button(action: { if selectedCircleIDs.contains(circle.id) { selectedCircleIDs.remove(circle.id) } else { selectedCircleIDs.insert(circle.id) } }) {
            HStack { VStack(alignment: .leading) { Text(circle.name).font(.system(size: 13, weight: .black)); Text(circle.memberLabel).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.45)) }; Spacer(); Image(systemName: selectedCircleIDs.contains(circle.id) ? "checkmark.circle.fill" : "circle").foregroundColor(NativeTheme.cyan) }.padding(11).background(Color.white.opacity(selectedCircleIDs.contains(circle.id) ? 0.09 : 0.035)).clipShape(RoundedRectangle(cornerRadius: 14))
        }.buttonStyle(.plain)
    }

    private func taxonomyChipRow(titles: [String], selected: String?, onTap: @escaping (String) -> Void) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 7)], alignment: .leading, spacing: 7) {
            ForEach(titles, id: \.self) { title in
                Button(action: { nativeImpactLight(); onTap(title) }) {
                    Text(title)
                        .font(.system(size: 11, weight: .black))
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .foregroundColor(selected == title ? .black : .white)
                        .background(selected == title ? Color.white : Color.white.opacity(0.06))
                        .clipShape(Capsule())
                }.buttonStyle(.plain).accessibilityLabel(title)
            }
        }
    }

    private func selectCategory(_ category: NativeHostCategory) {
        taxonomy.select(category: category)
        applyPrinter(taxonomy.type.printer)
    }

    private func selectType(_ type: NativeHostType) {
        taxonomy.select(type: type)
        applyPrinter(type.printer)
    }

    private func applyPrinter(_ id: NativePartyTemplateID) {
        templateID = id
        if id == .privateParty { accessMode = .privateApproval }
    }

    private var navigationButtons: some View {
        HStack(spacing: 10) {
            if step != .spark { Button("Back") { step = Step(rawValue: step.rawValue - 1) ?? .spark; publishPresentation.message = "" }.studioSecondaryButton() }
            Button(action: advance) { HStack { if isPublishing { ProgressView().tint(.black) }; Text(primaryTitle); if !isPublishing { Image(systemName: "sparkles") } }.font(.system(size: 14, weight: .black)).frame(maxWidth: .infinity).frame(height: 52).foregroundColor(.black).background(Color.white).clipShape(RoundedRectangle(cornerRadius: 17)) }.buttonStyle(.plain).disabled(isPublishing)
        }
    }

    private var primaryTitle: String { isPublishing ? "Dropping…" : step == .spark ? "Build this vibe" : step == .build ? "Set the door" : step == .door ? "Invite your people" : "Drop the Moment" }

    private func advance() {
        publishPresentation.message = ""
        if step == .build && (title.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || venueName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { publishPresentation.message = "Add a title and venue before setting the door."; return }
        if step == .door && draft.validationMessage != nil { publishPresentation.message = draft.validationMessage ?? "Review the door settings."; return }
        guard step == .invite else { step = Step(rawValue: step.rawValue + 1) ?? .invite; return }
        // Surface identity field errors before any draft or media work starts.
        if let message = hostIdentity.validationMessage { publishPresentation.message = message; return }
        guard !isPublishing else { return }
        isPublishing = true
        publishTask = Task { await publish() }
    }

    @MainActor private func publish() async {
        guard sessionStore.isAuthenticated, sessionStore.canAttachBearerToken, let publishingToken = sessionStore.token else { isPublishing = false; publishPresentation.message = "Sign in before publishing this moment."; return }
        defer { isPublishing = false; publishTask = nil }
        do {
            let api = NativePartyStudioAPI(client: BytspotAPIClient(tokenProvider: { publishingToken }))
            publishStage = "draft"
            let partyID = try await api.createDraft(draft, idempotencyKey: idempotencyKey)
            try Task.checkCancellation()
            guard sessionStore.token == publishingToken else { throw NativePartyStudioError.sessionChanged }
            publishStage = "media reset"
            publishPresentation.message = "Preparing Party media…"
            try await api.resetMedia(partyID: partyID)
            if let coverMedia {
                publishStage = "cover upload"
                publishPresentation.message = "Uploading cover poster…"
                _ = try await api.uploadMedia(partyID: partyID, kind: .cover, dataURI: coverMedia.dataURI)
            }
            for (index, media) in albumMedia.enumerated() {
                publishStage = "album upload"
                publishPresentation.message = "Uploading album photo \(index + 1) of \(albumMedia.count)…"
                _ = try await api.uploadMedia(partyID: partyID, kind: .album, index: index, dataURI: media.dataURI)
            }
            try Task.checkCancellation()
            guard sessionStore.token == publishingToken else { throw NativePartyStudioError.sessionChanged }
            publishStage = "identity"
            // Save the Official Host identity first: publish snapshots the
            // profile onto the party, so the save must land before it.
            // Persist the current selection — including an empty list — only
            // after a successful profile load, so a transient fetch failure
            // cannot wipe a real profile and a cleared editor cannot leak
            // stale destinations onto the next publish snapshot.
            if didLoadHostIdentity { try await api.saveHostIdentity(hostIdentity) }
            publishStage = "publish"
            let result = try await api.publish(partyID: partyID, draft: draft, idempotencyKey: idempotencyKey)
            try Task.checkCancellation()
            guard sessionStore.token == publishingToken else { throw NativePartyStudioError.sessionChanged }
            publishPresentation.completePublish(with: result)
            await loadArrivalVenueCandidates(for: result, token: publishingToken)
        }
        catch is CancellationError { if publishPresentation.message.isEmpty { publishPresentation.message = NativePartyStudioError.sessionChanged.localizedDescription } }
        catch {
            Self.recordPublishFailure(error, stage: publishStage)
            publishPresentation.message = NativePartyStudioError.publishUserMessage(for: error)
        }
    }

    private static func recordPublishFailure(_ error: Error, stage: String) {
        #if DEBUG
        let status: Int
        if case let BytspotAPIClient.APIError.server(httpStatus, _) = error {
            status = httpStatus
        } else {
            status = 0
        }
        UserDefaults.standard.set(stage, forKey: "bytspot_debug_party_publish_failure_stage")
        UserDefaults.standard.set(status, forKey: "bytspot_debug_party_publish_failure_status")
        #endif
    }

    @MainActor private func loadArrivalVenueCandidates(for party: NativePublishedParty, token: String) async {
        isLoadingArrivalVenues = true
        defer { isLoadingArrivalVenues = false }
        do {
            arrivalVenueCandidates = try await NativePartyArrivalAPI(client: BytspotAPIClient(tokenProvider: { token })).matchingRegisteredVenues(named: party.draft.venueName)
        } catch is CancellationError {
            return
        } catch {
            arrivalVenueCandidates = []
            publishPresentation.completeArrivalLookupFailure()
        }
    }

    private var draft: NativePartyDraftInput {
        let count = Int(capacity) ?? 0
        let cents = max(0, Int(((Double(ticketPrice) ?? 0) * 100).rounded()))
        let teammate = teammateEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return NativePartyDraftInput(templateID: templateID, title: title.trimmingCharacters(in: .whitespacesAndNewlines), tagline: tagline.trimmingCharacters(in: .whitespacesAndNewlines), startsAt: startsAt, endsAt: hostSetsEnd ? endsAt : nil, venueName: venueName.trimmingCharacters(in: .whitespacesAndNewlines), locationDisclosure: locationDisclosure, capacity: count, accessMode: accessMode, requiredMembershipTier: requiredTier, audienceCircleIDs: Array(selectedCircleIDs).sorted(), itinerary: template.itinerary.enumerated().map { NativePartyItineraryItem(title: $0.element, offsetMinutes: currentBeatOffsets[$0.offset]) }, ticketTiers: accessMode == .paidTicket ? [NativePartyTicketTier(name: "First Drop", priceCents: cents, quantity: count, requiredMembershipTier: requiredTier)] : [], cohosts: teammate.isEmpty ? [] : [NativePartyHostAssignment(email: teammate, role: teammateRole)], templateConfiguration: templateConfiguration, taxonomy: taxonomy)
    }

    private var templateConfiguration: NativePartyTemplateConfiguration {
        switch templateID {
        case .listeningParty: return .listeningParty(listeningFormat)
        case .fanMeetup: return .fanMeetup(fanMeetupFormat)
        case .releaseParty: return .releaseParty(releaseFormat, releaseTitle)
        case .popUp: return .popUp(NativePopUpLocationDisclosure(rawValue: locationDisclosure.rawValue) ?? .withheld)
        case .privateParty: return .privateParty(privateGuestPolicy)
        case .comedyNight, .premiere: return .standard
        }
    }

    private func partyPass(_ party: NativePublishedParty) -> some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "checkmark").font(.system(size: 26, weight: .black)).foregroundColor(.black).frame(width: 56, height: 56).background(NativeTheme.emerald).clipShape(Circle())
                VStack(spacing: 4) { Text("YOUR MOMENT IS LIVE").font(.system(size: 10, weight: .black)).tracking(1.8).foregroundColor(NativeTheme.emerald); Text("Party Pass ready.").font(.system(size: 28, weight: .black, design: .rounded)) }
                VStack(alignment: .leading, spacing: 14) {
                    partyPassHeader(party)
                    Text(party.draft.title).font(.system(size: 25, weight: .black, design: .rounded))
                    Text("\(party.draft.startsAt.formatted(date: .abbreviated, time: .shortened)) · \(party.draft.venueName)").font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.52))
                    partyPassCode(party.passCode)
                    HStack(spacing: 12) {
                        Button(action: { sharePartyQR(party) }) { NativePartyShareQR(value: party.shareURL.absoluteString).frame(width: 72, height: 72) }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Share Party QR code")
                            .accessibilityHint("Opens the share sheet with the QR image and Party link.")
                        VStack(alignment: .leading, spacing: 4) { Text("SHARE PARTY QR").font(.system(size: 9, weight: .black)).tracking(1.3).foregroundColor(NativeTheme.cyan); Text("Tap the code to share it. Anyone can scan it to open the Party and RSVP, request approval, or buy a ticket. The link stops working when the Party ends.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.55)) }
                    }
                }.padding(20).background(Color.white.opacity(0.07)).overlay(RoundedRectangle(cornerRadius: 25).stroke(Color.white.opacity(0.12))).clipShape(RoundedRectangle(cornerRadius: 25)).accessibilityIdentifier("native-party-pass")
                arrivalDestinationControls(for: party)
                Button(action: { sharePartyLink(party.shareURL) }) { Label("Share Party Link", systemImage: "square.and.arrow.up.fill").font(.system(size: 14, weight: .black)).frame(maxWidth: .infinity).frame(height: 52).foregroundColor(.white).background(NativeTheme.purple).clipShape(RoundedRectangle(cornerRadius: 17)) }.buttonStyle(.plain)
                Button(action: { showingPartyControl = true }) { Label("Open Party Control", systemImage: "person.3.sequence.fill").font(.system(size: 14, weight: .black)).frame(maxWidth: .infinity).frame(height: 52).foregroundColor(.black).background(NativeTheme.cyan).clipShape(RoundedRectangle(cornerRadius: 17)) }.buttonStyle(.plain)
                if !publishPresentation.message.isEmpty { Text(publishPresentation.message).font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.emerald) }
            }.padding(20).padding(.top, 18)
        }
    }

    private func partyPassCode(_ code: String) -> some View {
        VStack(spacing: 5) {
            Text("PASS CODE").font(.system(size: 9, weight: .black)).tracking(1.6).foregroundColor(.white.opacity(0.4))
            Text(code).font(.system(size: 25, weight: .black, design: .monospaced)).tracking(4)
        }.frame(maxWidth: .infinity).padding(17)
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(style: StrokeStyle(lineWidth: 1, dash: [5])).foregroundColor(.white.opacity(0.22)))
    }

    private func partyPassHeader(_ party: NativePublishedParty) -> some View {
        let tier = party.draft.requiredMembershipTier
        return HStack {
            Text("\(tier.displayName.uppercased()) PARTY PASS").font(.system(size: 10, weight: .black)).foregroundColor(BytspotTheme.accent(for: tier))
            Spacer()
            Text(template.emoji).font(.system(size: 26))
        }
    }

    @ViewBuilder private func arrivalDestinationControls(for party: NativePublishedParty) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("AUTHORIZED ARRIVAL DESTINATION").studioLabel()
            if let boundArrivalVenueID, let venue = arrivalVenueCandidates.first(where: { $0.id == boundArrivalVenueID }) {
                Label("Arrival enabled for \(venue.name)", systemImage: "checkmark.seal.fill").font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.emerald)
                Text("Guests with Party access can plan a route. Black and Platinum guests can request a provider handoff; pickup coordinates are not collected by Bytspot.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.52))
            } else if isLoadingArrivalVenues {
                ProgressView("Checking registered venues…").tint(NativeTheme.cyan).font(.system(size: 12, weight: .bold))
            } else if arrivalVenueCandidates.isEmpty {
                Text("No registered Bytspot Venue exactly matches this Party venue. Arrival routing stays unavailable.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.52))
            } else {
                Text("Choose the matching registered venue before enabling guest arrival guidance.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.52))
                ForEach(arrivalVenueCandidates) { venue in
                    Button(action: { Task { await bindArrivalDestination(venue, to: party) } }) {
                        HStack { VStack(alignment: .leading, spacing: 2) { Text(venue.name).font(.system(size: 13, weight: .black)); Text(venue.address).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.52)) }; Spacer(); if isBindingArrivalDestination { ProgressView().tint(NativeTheme.cyan) } else { Image(systemName: "location.circle.fill").foregroundColor(NativeTheme.cyan) } }
                            .padding(12).studioSurface()
                    }.buttonStyle(.plain).disabled(isBindingArrivalDestination)
                }
            }
        }.padding(14).studioSurface()
    }

    @MainActor private func bindArrivalDestination(_ venue: NativePartyArrivalVenue, to party: NativePublishedParty) async {
        guard sessionStore.canAttachBearerToken, let token = sessionStore.token else { publishPresentation.message = "Sign in before enabling arrival guidance."; return }
        isBindingArrivalDestination = true
        defer { isBindingArrivalDestination = false }
        do {
            try await NativePartyArrivalAPI(client: BytspotAPIClient(tokenProvider: { token })).bindDestination(partyID: party.id, venueID: venue.id)
            boundArrivalVenueID = venue.id
        } catch {
            publishPresentation.message = "The authorized arrival destination could not be enabled."
        }
    }

    private func sharePartyLink(_ url: URL) {
        if !NativePartySharePresentation.share([url]) {
            publishPresentation.message = "Party link is ready to share."
        }
    }

    private func sharePartyQR(_ party: NativePublishedParty) {
        let qrImage = NativePartyShareQR.image(party.shareURL.absoluteString)
        if !NativePartySharePresentation.share([qrImage, party.shareURL]) {
            publishPresentation.message = "Party link is ready to share."
        }
    }

    private func sectionHeading(_ eyebrow: String, _ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(eyebrow).font(.system(size: 10, weight: .black)).tracking(1.5).foregroundColor(tierAccent); Text(title).font(.system(size: 25, weight: .black, design: .rounded)); Text(subtitle).font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.48)) }
    }

    private func field(_ label: String, text: Binding<String>, icon: String, prompt: String, keyboard: UIKeyboardType = .default) -> some View {
        HStack(spacing: 10) { Image(systemName: icon).foregroundColor(NativeTheme.cyan).frame(width: 20); TextField(prompt, text: text).keyboardType(keyboard).textInputAutocapitalization([.emailAddress, .URL].contains(keyboard) ? .never : .sentences).autocorrectionDisabled([.emailAddress, .URL].contains(keyboard)).accessibilityLabel(label) }.font(.system(size: 13.5, weight: .semibold)).padding(13).studioSurface()
    }

    private func accessDetail(_ mode: NativePartyAccessMode) -> String { mode == .freeRSVP ? "Fastest way to fill the room." : mode == .paidTicket ? "Sell a limited first drop." : "You approve every guest." }
    private var roleSummary: String { teammateRole == .cohost ? "Edit, invite, and check-in access." : teammateRole == .door ? "Check-in access only." : "Refund and payout access only." }

    private func setCoverImage(_ image: UIImage?) {
        guard let image, let media = NativePartyPendingImage(image: image) else { if image != nil { publishPresentation.message = "That cover could not be prepared." }; return }
        coverMedia = media
    }

    private func addAlbumImages(_ images: [UIImage]) {
        let candidates = Array(images.prefix(6 - albumMedia.count))
        let prepared = candidates.compactMap(NativePartyPendingImage.init(image:))
        albumMedia.append(contentsOf: prepared)
        if prepared.count != candidates.count { publishPresentation.message = "Some photos could not be prepared." }
    }
}

private struct NativePartyPendingImage: Identifiable {
    let id = UUID()
    let preview: UIImage
    let dataURI: String

    init?(image: UIImage) {
        let maxDimension: CGFloat = 1400
        let scale = min(1, maxDimension / max(image.size.width, image.size.height))
        let size = CGSize(width: max(1, image.size.width * scale), height: max(1, image.size.height * scale))
        let rendered = UIGraphicsImageRenderer(size: size).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        var quality: CGFloat = 0.82
        var data = rendered.jpegData(compressionQuality: quality)
        while let current = data, current.count > 600_000, quality > 0.32 {
            quality -= 0.10
            data = rendered.jpegData(compressionQuality: quality)
        }
        guard let data, data.count <= 600_000 else { return nil }
        preview = rendered
        dataURI = "data:image/jpeg;base64," + data.base64EncodedString()
    }
}

private struct NativePartyPhotoPicker: UIViewControllerRepresentable {
    let selectionLimit: Int
    let completion: ([UIImage]) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.filter = .images
        configuration.selectionLimit = selectionLimit
        configuration.selection = .ordered
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let completion: ([UIImage]) -> Void
        init(completion: @escaping ([UIImage]) -> Void) { self.completion = completion }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            let group = DispatchGroup()
            var images = Array<UIImage?>(repeating: nil, count: results.count)
            for (index, result) in results.enumerated() where result.itemProvider.canLoadObject(ofClass: UIImage.self) {
                group.enter()
                result.itemProvider.loadObject(ofClass: UIImage.self) { object, _ in
                    DispatchQueue.main.async {
                        if let image = object as? UIImage { images[index] = image }
                        group.leave()
                    }
                }
            }
            group.notify(queue: .main) { self.completion(images.compactMap { $0 }) }
        }
    }
}

private extension Text {
    func studioLabel() -> some View { font(.system(size: 9.5, weight: .black)).tracking(1.2).foregroundColor(.white.opacity(0.45)) }
}

private extension View {
    func studioSurface(selected: Bool = false, accent: Color = NativeTheme.pink) -> some View { background(selected ? accent.opacity(0.13) : Color.white.opacity(0.055)).overlay(RoundedRectangle(cornerRadius: 17).stroke(selected ? accent.opacity(0.72) : Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 17)) }
    func studioSecondaryButton() -> some View { font(.system(size: 13, weight: .black)).foregroundColor(.white).padding(.horizontal, 19).frame(height: 52).background(Color.white.opacity(0.07)).clipShape(RoundedRectangle(cornerRadius: 17)) }
}