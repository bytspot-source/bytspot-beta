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
    /// Who last wrote the door. Two booleans could disagree; one owner cannot.
    enum Owner: String, Equatable { case host, disclosure, type }

    struct State: Equatable {
        var accessMode: NativePartyAccessMode
        var owner: Owner
    }

    /// Only `afterApproval` can move the door, and only a move it actually made
    /// is attributed. A host already on Private Approval is left alone.
    static func applyDisclosure(_ disclosure: NativePartyLocationDisclosure, to state: State) -> State {
        guard disclosure == .afterApproval else {
            // The disclosure step gives back only a door it took.
            return state.owner == .disclosure ? State(accessMode: state.accessMode, owner: .host) : state
        }
        guard state.accessMode != .privateApproval else { return state }
        return State(accessMode: .privateApproval, owner: .disclosure)
    }

    /// A door the host picked is theirs, so it is never attributed elsewhere.
    static func applyHostChoice(_ mode: NativePartyAccessMode) -> State {
        State(accessMode: mode, owner: .host)
    }

    /// A type can also move the door, because an approval-only type has exactly
    /// one legal door. A door the type took is handed back as soon as the host
    /// switches to a type that allows public formats — otherwise the House party
    /// lock follows them into Nightlife and Ticket/RSVP stay unreachable. A door
    /// the host or the disclosure step owns is never moved.
    static func applyType(allowedDoors: [NativePartyAccessMode], openingDoor: NativePartyAccessMode, to state: State) -> State {
        guard allowedDoors.contains(state.accessMode) else {
            return State(accessMode: openingDoor, owner: .type)
        }
        guard state.owner == .type, allowedDoors.count > 1 else { return state }
        return State(accessMode: openingDoor, owner: .type)
    }

    /// The note explains a choice the host did not make. It must not appear over
    /// a Private Approval door the host selected themselves.
    static func showsAttribution(_ state: State) -> Bool {
        state.owner == .disclosure && state.accessMode == .privateApproval
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

/// Presentation names change without changing the draft's four-stage flow.
/// Navigation never owns (or resets) any of the host's form state.
enum NativeHostStudioStep: Int, CaseIterable {
    case spark, build, door, invite

    var title: String {
        switch self {
        case .spark: return "Edition"
        case .build: return "Details"
        case .door: return "Access"
        case .invite: return "Review"
        }
    }

    var previous: Self { Self(rawValue: rawValue - 1) ?? .spark }
    var next: Self { Self(rawValue: rawValue + 1) ?? .invite }
    var primaryTitle: String { self == .invite ? "Publish party" : "Continue to \(next.title)" }

    func validationMessage(title: String, venue: String, draftMessage: String?, identityMessage: String?) -> String? {
        if self == .build && (title.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || venue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) {
            return "Add a title and venue before setting the door."
        }
        if self == .door { return draftMessage }
        if self == .invite { return identityMessage }
        return nil
    }
}

enum NativeHostStudioPresentation {
    /// This printer has an additional required text field; its format remains
    /// optional, but its title must stay alongside the always-visible essentials.
    static func requiresReleaseTitle(for templateID: NativePartyTemplateID) -> Bool {
        templateID == .releaseParty
    }

    static func animation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .interpolatingSpring(mass: 0.8, stiffness: 320, damping: 30, initialVelocity: 0)
    }
}

struct NativeHostStudioView: View {
    private typealias Step = NativeHostStudioStep

    /// Host Studio is reached two ways: presented over another surface, where
    /// it owns a way back, and as the Host tab, where the bar is the way out
    /// and a back control would dismiss nothing.
    enum Presentation { case cover, tab }

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    let circles: [NativeSocialCircle]
    let membershipTier: BytspotTier
    var presentation: Presentation = .cover

    @State private var step: Step = .spark
    @State private var expandedSections: Set<String> = []
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
    /// Who last wrote the door, so the door step can say why it changed. The
    /// opening door comes from the default House party type, not from the host,
    /// so it is released the moment they pick a public-capable type.
    @State private var doorOwner: NativeHostDoorAttribution.Owner = .type
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
    @State private var showCoverPicker = false
    @State private var arrivalVenueCandidates: [NativePartyArrivalVenue] = []
    @State private var registeredVenues: [NativePartyArrivalVenue] = []
    /// The venue actually bound, from either the registered-catalog match or a
    /// place search, so the confirmation reads the same for both paths.
    @State private var boundArrivalVenue: NativePartyArrivalVenue?
    @State private var arrivalPlaceQuery = ""
    @State private var arrivalPlaceResults: [NativePlaceSearchResult] = []
    @State private var isSearchingArrivalPlaces = false
    @State private var didSearchArrivalPlaces = false
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

    private var studioAnimation: Animation? { NativeHostStudioPresentation.animation(reduceMotion: reduceMotion) }
    private var choiceColumns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 8), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2)
    }

    var body: some View {
        ZStack {
            NativeDeepSpaceGround()
            VStack(spacing: 0) {
                header
                if let party = publishPresentation.party { partyPass(party) }
                else { studio }
            }
        }
        .foregroundColor(NativeTheme.textPrimary)
        .tint(NativeTheme.cyan)
        .transaction { if reduceMotion { $0.disablesAnimations = true } }
        .task { await prefillHostIdentity() }
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
        .sheet(isPresented: $showingPartyControl) {
            if let party = publishPresentation.party { NativePartyControlView(partyID: party.id).environmentObject(sessionStore) }
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text("Host Studio").font(.headline).accessibilityAddTraits(.isHeader)
            Spacer()
            if presentation == .cover {
                Button(action: { dismiss() }) {
                    Label("Close", systemImage: "xmark").font(.subheadline.weight(.semibold))
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-host-studio-close")
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private var studio: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    progress.id("host-step-top")
                    stepContent
                }
                .padding(.horizontal, 16).padding(.vertical, 16)
            }
            .onChange(of: step) { _ in proxy.scrollTo("host-step-top", anchor: .top) }
        }
        // The shell reserves its own bar area. Inset this content, not the
        // window, so the footer sits above that bar and above the keyboard.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                if !publishPresentation.message.isEmpty {
                    Text(publishPresentation.message).font(.footnote.weight(.semibold))
                        .foregroundColor(NativeTheme.orange)
                        .accessibilityIdentifier("native-host-studio-message")
                }
                navigationButtons
            }
            .padding(16).background(NativeHostStudioSurfaceFill())
        }
    }

    private var progress: some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(Step.allCases, id: \.rawValue) { item in
                VStack(alignment: .leading, spacing: 8) {
                    Capsule().fill(item.rawValue <= step.rawValue ? NativeTheme.cyan : NativeTheme.surfaceStroke).frame(height: 4)
                    Text(item.title).font(.caption.weight(item == step ? .bold : .medium))
                        .foregroundColor(item == step ? NativeTheme.textPrimary : NativeTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(step.title), step \(step.rawValue + 1) of 4")
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
        VStack(alignment: .leading, spacing: 24) {
            sectionHeading("Choose your edition", "Start with a category, then choose the type of gathering.")
            LazyVGrid(columns: choiceColumns, spacing: 8) {
                ForEach(NativeHostCategory.allCases) { category in
                    Button(action: { nativeImpactLight(); withAnimation(studioAnimation) { selectCategory(category) } }) {
                        NativeHostCategoryCard(category: category, selected: taxonomy.category == category)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(category.title)
                    .accessibilityValue(taxonomy.category == category ? "Selected" : "Not selected")
                    .accessibilityAddTraits(taxonomy.category == category ? .isSelected : [])
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Type").studioLabel()
                LazyVGrid(columns: choiceColumns, spacing: 8) {
                    ForEach(NativeHostType.types(in: taxonomy.category)) { type in
                        Button(action: { nativeImpactLight(); withAnimation(studioAnimation) { selectType(type) } }) {
                            Text(type.name).font(.subheadline.weight(.semibold))
                                .padding(8).frame(maxWidth: .infinity, minHeight: 44)
                                .studioSurface(selected: taxonomy.type.id == type.id)
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue(taxonomy.type.id == type.id ? "Selected" : "Not selected")
                        .accessibilityAddTraits(taxonomy.type.id == type.id ? .isSelected : [])
                    }
                }
            }
            optionalSection("Format & age", icon: "slider.horizontal.3") {
                Text("Format · optional").studioLabel()
                taxonomyChipRow(titles: taxonomy.category.formats.map(\.title), selected: taxonomy.format?.title) { title in
                    let format = taxonomy.category.formats.first { $0.title == title }
                    taxonomy.format = taxonomy.format == format ? nil : format
                }
                Text("Age · optional").studioLabel()
                taxonomyChipRow(titles: NativeHostAgeRule.allCases.map(\.title), selected: taxonomy.age?.title) { title in
                    let age = NativeHostAgeRule.allCases.first { $0.title == title }
                    taxonomy.age = taxonomy.age == age ? nil : age
                }
            }
        }
    }

    private func tierOptionCard(_ tier: BytspotTier) -> some View {
        let selected = requiredTier == tier
        return Button(action: { nativeImpactLight(); requiredTier = tier }) {
            HStack(spacing: 8) {
                Text(tier.displayName).font(.subheadline.weight(.semibold))
                if selected { Image(systemName: "checkmark").foregroundColor(NativeTheme.cyan) }
            }
            .padding(8).frame(maxWidth: .infinity, minHeight: 44)
            .studioSurface(selected: selected)
        }
        .buttonStyle(.plain).accessibilityLabel("\(tier.displayName) tier")
        .accessibilityValue(selected ? "Selected" : "Not selected")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var buildContent: some View {
        VStack(alignment: .leading, spacing: 24) {
            sectionHeading("Set the details", "Name your gathering and tell guests when and where.")
            VStack(alignment: .leading, spacing: 16) {
                Text("Essentials").studioLabel()
                field("Party title", text: $title, icon: "sparkles", prompt: "Give the night a name")
                VStack(alignment: .leading, spacing: 8) {
                    Text("Date & time").studioLabel()
                    DatePicker("Party date and time", selection: $startsAt, displayedComponents: [.date, .hourAndMinute])
                        .labelsHidden().font(.body).frame(minHeight: 44)
                        .accessibilityLabel("Party date and time")
                }
                field("Party venue", text: $venueName, icon: "mappin.and.ellipse", prompt: "Venue or secret location")
                registeredVenueSuggestions
                locationDisclosureEditor
                // Release title is validated by the printer; never bury it in
                // an optional disclosure alongside the format controls.
                if NativeHostStudioPresentation.requiresReleaseTitle(for: templateID) {
                    field("Release title", text: $releaseTitle, icon: "music.note.list", prompt: "Single, album, mix, or video title")
                }
            }
            optionalSection("Tagline & cover", icon: "photo") {
                field("Party tagline", text: $tagline, icon: "quote.bubble.fill", prompt: "One-line hook")
                partyMediaEditor
            }
            if templateID != .comedyNight && templateID != .premiere {
                optionalSection("Template options", icon: "slider.horizontal.3") { templateConfigurationEditor }
            }
            optionalSection("Run of show", icon: "clock") { runOfShowEditor }
            optionalSection("Host destinations", icon: "link") { officialDestinationsEditor }
        }
    }

    @ViewBuilder private var templateConfigurationEditor: some View {
        switch templateID {
        case .listeningParty:
            templatePicker("MUSIC FORMAT", selection: $listeningFormat, options: NativeListeningPartyFormat.allCases)
        case .fanMeetup:
            templatePicker("MEETUP FORMAT", selection: $fanMeetupFormat, options: NativeFanMeetupFormat.allCases)
        case .releaseParty:
            templatePicker("Release format", selection: $releaseFormat, options: NativeReleaseFormat.allCases)
        case .popUp:
            VStack(alignment: .leading, spacing: 8) {
                Text("Pop-up location").studioLabel()
                Text(locationDisclosure.recipientExplanation).font(.footnote).foregroundColor(NativeTheme.textSecondary)
            }
        case .privateParty:
            VStack(alignment: .leading, spacing: 8) {
                templatePicker("Guest list", selection: $privateGuestPolicy, options: NativePrivatePartyGuestPolicy.allCases)
                Text("Private Parties always use host approval. Named guest enforcement is introduced with the authorized guest action.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            }
        case .comedyNight, .premiere:
            EmptyView()
        }
    }

    private var locationDisclosureEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            templatePicker("Location on Party Pass", selection: $locationDisclosure, options: NativePartyLocationDisclosure.allCases)
            Text(locationDisclosure.recipientExplanation).font(.footnote).foregroundColor(NativeTheme.textSecondary)
        }
        .padding(16).studioSurface()
        // Selecting "After approval" moves the door to Private Approval because
        // only that mode has an approver. The write is recorded so the door step
        // can attribute it, rather than the host finding a choice they did not
        // make already selected.
        .onChange(of: locationDisclosure) { disclosure in
            let next = NativeHostDoorAttribution.applyDisclosure(
                disclosure,
                to: .init(accessMode: accessMode, owner: doorOwner),
            )
            accessMode = next.accessMode
            doorOwner = next.owner
        }
    }

    /// Editable Run of Show: each beat gets a wall-clock time picker on the
    /// existing party clock (offsets roll to the next day for all-day rooms),
    /// plus an optional host-set end. No second clock, no cron.
    private var runOfShowEditor: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Times ride the party clock. A beat earlier than the start rolls to the next day.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            ForEach(Array(template.itinerary.enumerated()), id: \.offset) { index, item in
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(index + 1). \(item)").font(.subheadline.weight(.semibold))
                    DatePicker("", selection: beatTimeBinding(index), displayedComponents: [.hourAndMinute])
                        .labelsHidden().frame(minHeight: 44)
                        .accessibilityLabel("\(item) time")
                }
            }
            Toggle(isOn: $hostSetsEnd.animation(studioAnimation)) {
                Text("Set party end").studioLabel()
            }
            .tint(NativeTheme.cyan).frame(minHeight: 44)
            if hostSetsEnd {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Party ends").studioLabel()
                    DatePicker("Party ends", selection: $endsAt, in: startsAt.addingTimeInterval(15 * 60)..., displayedComponents: [.date, .hourAndMinute])
                        .labelsHidden().font(.body).frame(minHeight: 44)
                        .accessibilityLabel("Party ends")
                }
            } else {
                Text("No end set: the party closes one hour after the last beat.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            }
        }
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
        VStack(alignment: .leading, spacing: 16) {
            Text("Official host destinations").studioLabel()
            Text("Saved to your host profile. Tap to add, tap again to remove. Guests see your verified host name — never a link.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(NativeHostDestinationKind.allCases) { kind in destinationPill(kind) }
                }
            }
            ForEach(Array(hostIdentity.destinations.enumerated()), id: \.element.id) { index, destination in
                destinationRow(index: index, destination: destination)
            }
        }.padding(16).studioSurface()
    }

    private func destinationPill(_ kind: NativeHostDestinationKind) -> some View {
        let isOn = hostIdentity.destinations.contains { $0.kind == kind }
        return Button(action: { toggleDestination(kind) }) {
            Label(kind.title, systemImage: kind.icon)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(NativeTheme.textPrimary)
                .padding(.horizontal, 16).padding(.vertical, 8).frame(minHeight: 44)
                .studioSurface(selected: isOn)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(kind.title) destination")
        .accessibilityValue(isOn ? "Added" : "Not added")
        .accessibilityHint(isOn ? "Removes this destination." : "Adds this destination.")
    }

    @ViewBuilder private func destinationRow(index: Int, destination: NativeHostIdentityDestination) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            field(destination.kind.title, text: destinationValueBinding(destination.kind), icon: destination.kind.icon, prompt: destination.kind.fieldPrompt, keyboard: destination.kind.isSocial ? .default : .URL)
            HStack(spacing: 8) {
                Button(action: { setPrimary(destination.kind) }) {
                    Image(systemName: destination.primary ? "star.fill" : "star")
                        .foregroundColor(destination.primary ? NativeTheme.cyan : NativeTheme.textSecondary)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel("\(destination.kind.title) primary")
                .accessibilityValue(destination.primary ? "Primary" : "Not primary")
                Spacer()
                Button(action: { moveDestination(destination.kind, by: -1) }) {
                    Image(systemName: "chevron.up").frame(minWidth: 44, minHeight: 44)
                }
                .disabled(index == 0).accessibilityLabel("Move \(destination.kind.title) up")
                Button(action: { moveDestination(destination.kind, by: 1) }) {
                    Image(systemName: "chevron.down").frame(minWidth: 44, minHeight: 44)
                }
                .disabled(index == hostIdentity.destinations.count - 1)
                .accessibilityLabel("Move \(destination.kind.title) down")
            }.font(.body.weight(.semibold)).buttonStyle(.plain)
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
        VStack(alignment: .leading, spacing: 8) {
            Text(label).studioLabel()
            Picker(label, selection: selection) {
                ForEach(Array(options), id: \.id) { option in Text(templateOptionTitle(option)).tag(option) }
            }.pickerStyle(.menu).font(.body).frame(minHeight: 44)
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
        VStack(alignment: .leading, spacing: 16) {
            Text("Cover poster").studioLabel()
            Text(NativePartyPendingImage.coverSpecLabel).font(.footnote).foregroundColor(NativeTheme.textSecondary)
            Button(action: { showCoverPicker = true }) {
                ZStack {
                    if let coverMedia {
                        // A fill image reports the size it scaled to, so it is
                        // pinned to the tile before it can widen the editor.
                        GeometryReader { proxy in
                            Image(uiImage: coverMedia.preview).resizable().scaledToFill()
                                .frame(width: proxy.size.width, height: proxy.size.height).clipped()
                        }
                    } else {
                        LinearGradient(colors: [NativeTheme.purple.opacity(0.7), NativeTheme.cyan.opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        Label("Choose cover poster", systemImage: "photo.badge.plus").font(.headline).padding(16)
                    }
                }
                // The tile is the declared poster shape, not a wide strip: a
                // host framing a poster in 2.5:1 could not see the crop a
                // guest gets.
                .frame(maxWidth: .infinity)
                .aspectRatio(NativePartyPendingImage.coverAspectRatio, contentMode: .fit)
                .clipped().clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(NativeTheme.surfaceStroke))
            }.buttonStyle(.plain).accessibilityLabel(coverMedia == nil ? "Choose cover poster" : "Change cover poster")
            Text("Anything else is centre-cropped to 3:2 when you publish.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            Text("Guests also see this poster behind the whole invite, dimmed. Recap photos go in Party Control after the room.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
        }
    }

    private var doorContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeading("Choose guest access", availableDoors.count > 1 ? "Choose RSVP, a paid first drop, or host approval." : "\(taxonomy.type.name) has one door.")
            // A single-option list looks like a broken picker unless the rule
            // that produced it is stated.
            if availableDoors.count == 1, let reason = taxonomy.type.door.singleDoorExplanation {
                Label(reason, systemImage: "lock.fill")
                    .font(.footnote)
                    .foregroundColor(NativeTheme.textSecondary)
                    .padding(16).studioSurface()
                    .accessibilityIdentifier("native-host-studio-door-constrained")
            }
            ForEach(availableDoors) { mode in
                Button(action: {
                    let next = NativeHostDoorAttribution.applyHostChoice(mode)
                    accessMode = next.accessMode
                    doorOwner = next.owner
                }) {
                    HStack(spacing: 16) {
                        Image(systemName: mode == .paidTicket ? "ticket.fill" : mode == .privateApproval ? "lock.fill" : "person.badge.plus").foregroundColor(NativeTheme.cyan)
                        VStack(alignment: .leading, spacing: 8) {
                            Text(mode.title).font(.headline)
                            Text(accessDetail(mode)).font(.footnote).foregroundColor(NativeTheme.textSecondary)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: accessMode == mode ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(accessMode == mode ? NativeTheme.cyan : NativeTheme.textTertiary)
                    }
                    .frame(minHeight: 44).padding(16).studioSurface(selected: accessMode == mode)
                }
                .buttonStyle(.plain)
                .accessibilityValue(accessMode == mode ? "Selected" : "Not selected")
                .accessibilityAddTraits(accessMode == mode ? .isSelected : [])
            }
            if locationDisclosure == .afterApproval && accessMode != .privateApproval {
                Label("Location is set to \u{201C}After approval\u{201D} in Details. Only Private Approval can reveal it.", systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(NativeTheme.orange)
                    .padding(16).studioSurface()
                    .accessibilityIdentifier("native-host-studio-disclosure-conflict")
            } else if NativeHostDoorAttribution.showsAttribution(.init(accessMode: accessMode, owner: doorOwner)) {
                Label("Set to Private Approval because your location is revealed after approval. Change either one.", systemImage: "info.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(NativeTheme.cyan)
                    .padding(16).studioSurface()
                    .accessibilityIdentifier("native-host-studio-door-auto-set")
            }
            if accessMode == .paidTicket { field("First Drop price", text: $ticketPrice, icon: "dollarsign.circle.fill", prompt: "25", keyboard: .decimalPad) }
            field("Capacity", text: $capacity, icon: "person.3.fill", prompt: "\(NativeHostTaxonomySelection.recommendedCapacity)", keyboard: .numberPad)
            VStack(alignment: .leading, spacing: 8) {
                Text("Minimum membership").studioLabel()
                LazyVGrid(columns: dynamicTypeSize.isAccessibilitySize ? [GridItem(.flexible())] : Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach([BytspotTier.green, .platinum, .black], id: \.rawValue) { tier in tierOptionCard(tier) }
                }
            }
            .padding(16).studioSurface()
        }
    }

    private var inviteContent: some View {
        VStack(alignment: .leading, spacing: 24) {
            sectionHeading("Review your party", "Check the details, choose your audience, then publish.")
            reviewSummary
            VStack(alignment: .leading, spacing: 16) {
                Label("Audience Circles", systemImage: "person.3.fill").font(.headline)
                Text("Optional. Choose the Circles you want to invite.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
                if circles.isEmpty {
                    Text("No synced Circles yet. Your share link still works anywhere.").font(.subheadline).foregroundColor(NativeTheme.textSecondary)
                } else { ForEach(circles) { circle in circleButton(circle) } }
            }.padding(16).studioSurface()
            optionalSection("Teammate · optional", icon: "person.badge.key.fill") {
                field("Co-host email", text: $teammateEmail, icon: "person.badge.key.fill", prompt: "name@email.com", keyboard: .emailAddress)
                Picker("Co-host role", selection: $teammateRole) {
                    ForEach([NativePartyHostRole.cohost, .door, .finance]) { role in Text(role.title).tag(role) }
                }.pickerStyle(.menu).frame(minHeight: 44)
                Text(roleSummary).font(.footnote).foregroundColor(NativeTheme.textSecondary)
            }
            Text("Publishing creates your Party Pass and share link.")
                .font(.footnote).foregroundColor(NativeTheme.textSecondary)
        }
    }

    private var reviewSummary: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(displayTitle).font(.title3.weight(.bold))
            if !tagline.isEmpty { Text(tagline).font(.subheadline).foregroundColor(NativeTheme.textSecondary) }
            reviewRow("Edition", value: "\(taxonomy.category.title) · \(taxonomy.type.name)", icon: "square.grid.2x2")
            if let format = taxonomy.format { reviewRow("Format", value: format.title, icon: "tag") }
            if let age = taxonomy.age { reviewRow("Age", value: age.title, icon: "person") }
            reviewRow("When", value: startsAt.formatted(date: .abbreviated, time: .shortened), icon: "calendar")
            if hostSetsEnd { reviewRow("Ends", value: endsAt.formatted(date: .abbreviated, time: .shortened), icon: "clock") }
            reviewRow("Where", value: venueName, icon: "mappin.and.ellipse")
            Text(locationDisclosure.recipientExplanation).font(.footnote).foregroundColor(NativeTheme.textSecondary)
            reviewRow("Access", value: accessMode.title, icon: "ticket")
            reviewRow("Capacity", value: capacity, icon: "person.3")
            reviewRow("Membership", value: requiredTier.displayName, icon: "checkmark.shield")
            if accessMode == .paidTicket { reviewRow("First Drop price", value: "$\(ticketPrice)", icon: "dollarsign.circle") }
            if templateID == .releaseParty { reviewRow("Release", value: releaseTitle, icon: "music.note.list") }
        }
        .padding(16).studioSurface()
        .accessibilityIdentifier("native-host-studio-review-summary")
    }

    private func reviewRow(_ label: String, value: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon).foregroundColor(NativeTheme.cyan).frame(width: 24)
            VStack(alignment: .leading, spacing: 8) {
                Text(label).font(.caption).foregroundColor(NativeTheme.textSecondary)
                Text(value).font(.subheadline.weight(.semibold))
            }
        }.accessibilityElement(children: .combine)
    }

    private func circleButton(_ circle: NativeSocialCircle) -> some View {
        let selected = selectedCircleIDs.contains(circle.id)
        return Button(action: { if selected { selectedCircleIDs.remove(circle.id) } else { selectedCircleIDs.insert(circle.id) } }) {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(circle.name).font(.subheadline.weight(.semibold))
                    Text(circle.memberLabel).font(.footnote).foregroundColor(NativeTheme.textSecondary)
                }
                Spacer(minLength: 8)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle").foregroundColor(NativeTheme.cyan)
            }.frame(minHeight: 44).padding(16).studioSurface(selected: selected)
        }
        .buttonStyle(.plain).accessibilityValue(selected ? "Selected" : "Not selected")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func taxonomyChipRow(titles: [String], selected: String?, onTap: @escaping (String) -> Void) -> some View {
        LazyVGrid(columns: choiceColumns, alignment: .leading, spacing: 8) {
            ForEach(titles, id: \.self) { title in
                Button(action: { nativeImpactLight(); onTap(title) }) {
                    Text(title).font(.subheadline.weight(.semibold)).padding(8)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .studioSurface(selected: selected == title)
                }
                .buttonStyle(.plain).accessibilityLabel(title)
                .accessibilityValue(selected == title ? "Selected" : "Not selected")
                .accessibilityAddTraits(selected == title ? .isSelected : [])
            }
        }
    }

    private func selectCategory(_ category: NativeHostCategory) {
        taxonomy.select(category: category)
        applyType(taxonomy.type)
    }

    private func selectType(_ type: NativeHostType) {
        taxonomy.select(type: type)
        applyType(type)
    }

    private func applyType(_ type: NativeHostType) {
        templateID = type.printer
        let next = NativeHostDoorAttribution.applyType(
            allowedDoors: type.availableDoors(for: templateConfiguration),
            openingDoor: type.openingDoor(for: templateConfiguration),
            to: .init(accessMode: accessMode, owner: doorOwner)
        )
        accessMode = next.accessMode
        doorOwner = next.owner
    }

    /// The doors this Party can actually offer: the type's policy narrowed by
    /// what its printer can express.
    private var availableDoors: [NativePartyAccessMode] {
        taxonomy.type.availableDoors(for: templateConfiguration)
    }

    private var navigationButtons: some View {
        HStack(spacing: 8) {
            if step != .spark {
                Button("Back") {
                    withAnimation(studioAnimation) { step = step.previous }
                    publishPresentation.message = ""
                }
                .studioSecondaryButton().disabled(isPublishing)
            }
            Button(action: advance) {
                HStack(spacing: 8) {
                    if isPublishing { ProgressView().tint(NativeTheme.inverseText) }
                    Text(isPublishing ? "Publishing…" : step.primaryTitle)
                    if !isPublishing { Image(systemName: step == .invite ? "checkmark" : "arrow.right") }
                }
                .font(.headline).padding(16).frame(maxWidth: .infinity, minHeight: 52)
                .foregroundColor(NativeTheme.inverseText).background(NativeTheme.cyan)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain).disabled(isPublishing)
            .accessibilityIdentifier("native-host-studio-continue")
        }
    }

    private func advance() {
        guard !isPublishing else { return }
        publishPresentation.message = ""
        if let message = step.validationMessage(title: title, venue: venueName, draftMessage: step == .door ? draft.validationMessage : nil, identityMessage: step == .invite ? hostIdentity.validationMessage : nil) {
            publishPresentation.message = message
            return
        }
        guard step == .invite else { withAnimation(studioAnimation) { step = step.next }; return }
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

    /// Registered venues are a public catalog, so this needs no bearer token and
    /// is silent on failure: suggestions are an assist, and a host who typed a
    /// venue name by hand must never be blocked by a catalog fetch.
    @MainActor private func loadRegisteredVenues() async {
        guard registeredVenues.isEmpty else { return }
        registeredVenues = (try? await NativePartyArrivalAPI(client: BytspotAPIClient()).registeredVenues()) ?? []
    }

    /// Offers the exact registered spelling when the host looks like they mean a
    /// venue Bytspot already knows. Tapping one only rewrites the venue name —
    /// binding still happens after publish, against the same exact-match rule,
    /// so a suggestion can never attach an address the host did not confirm.
    @ViewBuilder private var registeredVenueSuggestions: some View {
        let suggestions = NativePartyArrivalAPI.suggestedRegisteredVenues(registeredVenues, matching: venueName)
        if !suggestions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Registered Bytspot venues").studioLabel()
                Text("Pick one to turn on arrival guidance for your guests. Keep typing to use a venue Bytspot does not know, or a secret location.")
                    .font(.footnote).foregroundColor(NativeTheme.textSecondary)
                ForEach(suggestions) { venue in
                    Button(action: { venueName = venue.name }) {
                        HStack(spacing: 8) {
                            Image(systemName: "mappin.circle.fill").foregroundColor(NativeTheme.cyan)
                            VStack(alignment: .leading, spacing: 8) {
                                Text(venue.name).font(.subheadline.weight(.semibold)).foregroundColor(NativeTheme.textPrimary)
                                Text(venue.address).font(.footnote).foregroundColor(NativeTheme.textSecondary)
                            }
                            Spacer()
                        }.frame(minHeight: 44).padding(16).studioSurface()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Use registered venue \(venue.name), \(venue.address)")
                }
            }.task { await loadRegisteredVenues() }
        } else {
            Color.clear.frame(height: 0).task { await loadRegisteredVenues() }
        }
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
            VStack(spacing: 24) {
                Image(systemName: "checkmark").font(.title.weight(.bold)).foregroundColor(NativeTheme.inverseText)
                    .frame(width: 56, height: 56).background(NativeTheme.cyan).clipShape(Circle())
                Text("Party Pass ready.").font(.title2.weight(.bold))
                VStack(alignment: .leading, spacing: 16) {
                    partyPassHeader(party)
                    Text(party.draft.title).font(.title2.weight(.bold))
                    Text("\(party.draft.startsAt.formatted(date: .abbreviated, time: .shortened)) · \(party.draft.venueName)")
                        .font(.subheadline).foregroundColor(NativeTheme.textSecondary)
                    partyPassCode(party.passCode)
                    VStack(alignment: .leading, spacing: 16) {
                        Button(action: { sharePartyQR(party) }) { NativePartyShareQR(value: party.shareURL.absoluteString).frame(width: 96, height: 96) }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Share Party QR code")
                            .accessibilityHint("Opens the share sheet with the QR image and Party link.")
                        Text("Tap the code to share it. Anyone can scan it to open the Party and RSVP, request approval, or buy a ticket. The link stops working when the Party ends.")
                            .font(.footnote).foregroundColor(NativeTheme.textSecondary)
                    }
                }.padding(16).studioSurface().accessibilityIdentifier("native-party-pass")
                arrivalDestinationControls(for: party)
                Button(action: { sharePartyLink(party.shareURL) }) {
                    Label("Share Party Link", systemImage: "square.and.arrow.up.fill").font(.headline)
                        .padding(16).frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundColor(NativeTheme.inverseText).background(NativeTheme.cyan)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }.buttonStyle(.plain)
                Button(action: { showingPartyControl = true }) {
                    Label("Open Party Control", systemImage: "person.3.sequence.fill").frame(maxWidth: .infinity)
                }.studioSecondaryButton()
                if !publishPresentation.message.isEmpty {
                    Text(publishPresentation.message).font(.footnote.weight(.semibold)).foregroundColor(NativeTheme.textSecondary)
                }
            }.padding(16)
        }
    }

    private func partyPassCode(_ code: String) -> some View {
        VStack(spacing: 8) {
            Text("Pass code").studioLabel()
            Text(code).font(.system(.title2, design: .monospaced).weight(.bold))
        }.frame(maxWidth: .infinity).padding(16)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(style: StrokeStyle(lineWidth: 1, dash: [5])).foregroundColor(NativeTheme.surfaceStroke))
    }

    private func partyPassHeader(_ party: NativePublishedParty) -> some View {
        let tier = party.draft.requiredMembershipTier
        return HStack {
            Text("\(tier.displayName) Party Pass").font(.subheadline.weight(.semibold)).foregroundColor(NativeTheme.textSecondary)
            Spacer()
            Text(template.emoji).font(.title2)
        }
    }

    @ViewBuilder private func arrivalDestinationControls(for party: NativePublishedParty) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Authorized arrival destination").studioLabel()
            if let venue = boundArrivalVenue {
                Label("Arrival enabled for \(venue.name)", systemImage: "checkmark.seal.fill").font(.headline).foregroundColor(NativeTheme.cyan)
                Text("Guests with Party access can plan a route. Black and Platinum guests can request a provider handoff; pickup coordinates are not collected by Bytspot.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            } else if isLoadingArrivalVenues {
                ProgressView("Checking registered venues…").tint(NativeTheme.cyan).font(.subheadline)
            } else {
                if !arrivalVenueCandidates.isEmpty {
                    Text("Choose the matching registered venue before enabling guest arrival guidance.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
                    ForEach(arrivalVenueCandidates) { venue in
                        Button(action: { Task { await bindArrivalDestination(venue, to: party) } }) {
                            arrivalResultLabel(name: venue.name, address: venue.address)
                        }.buttonStyle(.plain).disabled(isBindingArrivalDestination)
                    }
                }
                arrivalPlaceSearch(for: party)
            }
        }.padding(16).studioSurface()
    }

    private func arrivalResultLabel(name: String, address: String) -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 8) {
                Text(name).font(.subheadline.weight(.semibold))
                Text(address).font(.footnote).foregroundColor(NativeTheme.textSecondary)
            }
            Spacer(minLength: 8)
            if isBindingArrivalDestination { ProgressView().tint(NativeTheme.cyan) }
            else { Image(systemName: "location.circle.fill").foregroundColor(NativeTheme.cyan) }
        }.frame(minHeight: 44).padding(16).studioSurface()
    }

    /// Real hosts rarely sit in the seeded catalog, so this is the path that
    /// actually turns the door on: search a place and bind it. The server
    /// creates a non-discoverable venue from the place and enables arrival
    /// guidance, so a place is never exposed through the public catalog.
    @ViewBuilder private func arrivalPlaceSearch(for party: NativePublishedParty) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(arrivalVenueCandidates.isEmpty
                 ? "No registered Bytspot Venue matches this Party. Search for your venue to turn on guest arrival guidance."
                 : "Or search for another venue.")
                .font(.footnote).foregroundColor(NativeTheme.textSecondary)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(NativeTheme.textSecondary)
                TextField("Search venues and places", text: $arrivalPlaceQuery)
                    .font(.body).foregroundColor(NativeTheme.textPrimary).frame(minHeight: 44)
                    .textInputAutocapitalization(.words).submitLabel(.search)
                    .onSubmit { Task { await searchArrivalPlaces() } }
                if isSearchingArrivalPlaces { ProgressView().tint(NativeTheme.cyan) }
            }.padding(16).studioSurface()
            ForEach(arrivalPlaceResults) { place in
                Button(action: { Task { await bindArrivalPlace(place, to: party) } }) {
                    arrivalResultLabel(name: place.name, address: place.address)
                }.buttonStyle(.plain).disabled(isBindingArrivalDestination)
                    .accessibilityLabel("Enable arrival for \(place.name), \(place.address)")
            }
            if didSearchArrivalPlaces && arrivalPlaceResults.isEmpty && !isSearchingArrivalPlaces {
                Text("No matching places found. Try a more specific name.").font(.footnote).foregroundColor(NativeTheme.textSecondary)
            }
        }
    }

    /// Place search is a public catalog lookup, so it needs no bearer token and
    /// stays silent on failure. Only bindable (Google-backed) rows are kept.
    @MainActor private func searchArrivalPlaces() async {
        let query = arrivalPlaceQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else { arrivalPlaceResults = []; return }
        isSearchingArrivalPlaces = true
        defer { isSearchingArrivalPlaces = false; didSearchArrivalPlaces = true }
        let results = (try? await NativeLiveDiscoveryAPI(client: BytspotAPIClient()).placesTextSearch(query: query)) ?? []
        arrivalPlaceResults = NativePartyArrivalAPI.bindablePlaceResults(results)
    }

    @MainActor private func bindArrivalPlace(_ place: NativePlaceSearchResult, to party: NativePublishedParty) async {
        guard sessionStore.canAttachBearerToken, let token = sessionStore.token else { publishPresentation.message = "Sign in before enabling arrival guidance."; return }
        isBindingArrivalDestination = true
        defer { isBindingArrivalDestination = false }
        do {
            let venue = try await NativePartyArrivalAPI(client: BytspotAPIClient(tokenProvider: { token })).bindPlace(partyID: party.id, placeID: place.id)
            boundArrivalVenue = venue
        } catch {
            publishPresentation.message = "That place could not be enabled as the arrival destination. Try another."
        }
    }

    @MainActor private func bindArrivalDestination(_ venue: NativePartyArrivalVenue, to party: NativePublishedParty) async {
        guard sessionStore.canAttachBearerToken, let token = sessionStore.token else { publishPresentation.message = "Sign in before enabling arrival guidance."; return }
        isBindingArrivalDestination = true
        defer { isBindingArrivalDestination = false }
        do {
            try await NativePartyArrivalAPI(client: BytspotAPIClient(tokenProvider: { token })).bindDestination(partyID: party.id, venueID: venue.id)
            boundArrivalVenue = venue
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

    private func sectionHeading(_ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
            Text(subtitle).font(.subheadline).foregroundColor(NativeTheme.textSecondary)
        }
    }

    private func optionalSection<Content: View>(_ title: String, icon: String, @ViewBuilder content: @escaping () -> Content) -> some View {
        NativeHostOptionalSection(title: title, icon: icon, content: content, expanded: Binding(
            get: { expandedSections.contains(title) },
            set: { if $0 { expandedSections.insert(title) } else { expandedSections.remove(title) } }
        ))
    }

    private func field(_ label: String, text: Binding<String>, icon: String, prompt: String, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).studioLabel()
            HStack(spacing: 8) {
                Image(systemName: icon).foregroundColor(NativeTheme.cyan).frame(width: 24)
                TextField(prompt, text: text).keyboardType(keyboard)
                    .textInputAutocapitalization([.emailAddress, .URL].contains(keyboard) ? .never : .sentences)
                    .autocorrectionDisabled([.emailAddress, .URL].contains(keyboard))
                    .accessibilityLabel(label).frame(minHeight: 44)
            }
            .font(.body).padding(.horizontal, 16).padding(.vertical, 8).studioSurface()
        }
    }

    private func accessDetail(_ mode: NativePartyAccessMode) -> String { mode == .freeRSVP ? "Fastest way to fill the room." : mode == .paidTicket ? "Sell a limited first drop." : "You approve every guest." }
    // Finance says refund only: this build ships without a payout rail, so
    // promising payout access would be a capability the app does not have.
    private var roleSummary: String { teammateRole == .cohost ? "Edit, invite, and check-in access." : teammateRole == .door ? "Check-in access only." : "Refund access only." }

    private func setCoverImage(_ image: UIImage?) {
        guard let image, let media = NativePartyPendingImage(image: image, shape: .cover) else { if image != nil { publishPresentation.message = "That cover could not be prepared." }; return }
        coverMedia = media
    }
}

struct NativePartyPendingImage: Identifiable {
    /// Long-edge ceiling in pixels. The Party banner is roughly 1170px on a 3x
    /// phone, so this leaves headroom for iPad without shipping 4K covers over
    /// cellular at the door.
    static let maxPixelDimension: CGFloat = 1600
    static let maxByteCount = 600_000

    /// Every guest surface crops the cover to its own height, so the shape a
    /// host should hand us is declared once here and stated in the editor.
    /// 3:2 at the pixel ceiling above.
    static let coverAspectRatio: CGFloat = 3.0 / 2.0
    static let coverPixelSize = CGSize(width: 1600, height: 1067)
    static var coverSpecLabel: String {
        "\(Int(coverPixelSize.width)) × \(Int(coverPixelSize.height)) · 3:2 landscape"
    }

    /// Album and recap photos keep the shape the host chose. Covers are
    /// normalised, because every guest surface crops the cover to its own
    /// height and five surfaces cropping five different shapes is not
    /// something a host can frame for.
    enum Shape {
        case original
        case cover
    }

    let id = UUID()
    let preview: UIImage
    let dataURI: String

    init?(image: UIImage, shape: Shape = .original) {
        // `image.size` is in points and UIGraphicsImageRenderer defaults to the
        // screen scale, so a points-based cap rendered up to 3x the pixels it
        // named: a 4K photo measures 1280x720 points, cleared a 1400 point
        // ceiling untouched, and came back out at 3840x2160. Measure in pixels
        // and pin the renderer to 1x so the cap means what it says.
        let pixelWidth = image.size.width * image.scale
        let pixelHeight = image.size.height * image.scale
        guard pixelWidth >= 1, pixelHeight >= 1 else { return nil }
        let size: CGSize
        let drawRect: CGRect
        switch shape {
        case .original:
            let scale = min(1, Self.maxPixelDimension / max(pixelWidth, pixelHeight))
            size = CGSize(width: max(1, (pixelWidth * scale).rounded()), height: max(1, (pixelHeight * scale).rounded()))
            drawRect = CGRect(origin: .zero, size: size)
        case .cover:
            // `coverPixelSize` is a ceiling, not a guarantee: a source that
            // cannot cover the box on both axes is emitted at 3:2 in the
            // largest size it can fill, because upscaling to reach the box
            // would invent rows.
            let box = Self.coverPixelSize
            let fit = min(1, pixelWidth / box.width, pixelHeight / box.height)
            size = CGSize(width: max(1, (box.width * fit).rounded()), height: max(1, (box.height * fit).rounded()))
            // Centre crop by drawing the source scaled to fill and letting the
            // renderer's bounds take the middle.
            let fill = max(size.width / pixelWidth, size.height / pixelHeight)
            let drawSize = CGSize(width: pixelWidth * fill, height: pixelHeight * fill)
            drawRect = CGRect(
                x: (size.width - drawSize.width) / 2,
                y: (size.height - drawSize.height) / 2,
                width: drawSize.width,
                height: drawSize.height
            )
        }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let rendered = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: drawRect) }
        var quality: CGFloat = 0.82
        var data = rendered.jpegData(compressionQuality: quality)
        while let current = data, current.count > Self.maxByteCount, quality > 0.32 {
            quality -= 0.10
            data = rendered.jpegData(compressionQuality: quality)
        }
        guard let data, data.count <= Self.maxByteCount else { return nil }
        preview = rendered
        dataURI = "data:image/jpeg;base64," + data.base64EncodedString()
    }
}

/// Shared with the recap surface in Party Control, which needs the same
/// ordered, limited selection the cover picker uses.
struct NativePartyPhotoPicker: UIViewControllerRepresentable {
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

/// Brand identity belongs to the category, never to the host's membership.
private struct NativeHostCategoryCard: View {
    let category: NativeHostCategory
    let selected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(category.illustrationAsset).renderingMode(.template).resizable().scaledToFit()
                    .frame(width: 32, height: 32).foregroundColor(category.brandAccent)
                Spacer(minLength: 8)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(selected ? NativeTheme.cyan : NativeTheme.textTertiary)
            }
            Text(category.title).font(.subheadline.weight(.semibold))
                .foregroundColor(NativeTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16).frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
        .studioSurface(selected: selected, accent: category.brandAccent)
        .accessibilityElement(children: .ignore)
    }
}

/// Opaque navy only when transparency is reduced; otherwise the shared sky
/// remains visible through a quiet adaptive surface, without black slabs.
private struct NativeHostStudioSurfaceFill: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        if reduceTransparency {
            Color.adaptive(lightHex: 0x252C52, darkHex: 0x151D35)
        } else {
            Color.adaptive(lightHex: 0x252C52, darkHex: 0x151D35, lightAlpha: 0.82, darkAlpha: 0.72)
        }
    }
}

private struct NativeHostStudioSurface: ViewModifier {
    let selected: Bool
    let accent: Color

    func body(content: Content) -> some View {
        content.background {
            ZStack {
                NativeHostStudioSurfaceFill()
                if selected { accent.opacity(0.10) }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(selected ? accent : NativeTheme.surfaceStroke, lineWidth: selected ? 2 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private extension Text {
    func studioLabel() -> some View { font(.subheadline.weight(.semibold)).foregroundColor(NativeTheme.textSecondary) }
}

private extension View {
    func studioSurface(selected: Bool = false, accent: Color = NativeTheme.cyan) -> some View {
        modifier(NativeHostStudioSurface(selected: selected, accent: accent))
    }
    func studioSecondaryButton() -> some View {
        buttonStyle(NativeHostStudioSecondaryButtonStyle())
    }
}

private struct NativeHostStudioSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.headline).foregroundColor(NativeTheme.textPrimary)
            .padding(16).frame(minWidth: 44, minHeight: 52)
            .studioSurface(selected: configuration.isPressed)
            .contentShape(Rectangle())
    }
}

/// Values and disclosure expansion both remain in Studio when a step leaves
/// the tree, so Back restores the editor exactly as the host left it.
private struct NativeHostOptionalSection<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: () -> Content
    @Binding var expanded: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        DisclosureGroup(isExpanded: $expanded.animation(NativeHostStudioPresentation.animation(reduceMotion: reduceMotion))) {
            VStack(alignment: .leading, spacing: 16, content: content).padding(.top, 8)
        } label: {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold))
                .foregroundColor(NativeTheme.textPrimary).frame(minHeight: 44)
        }
        .padding(16).studioSurface()
    }
}