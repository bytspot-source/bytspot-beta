import SwiftUI
import UserNotifications

@main
struct BytspotClipApp: App {
    @StateObject private var invocation = ClipInvocationModel()

    init() {
        #if DEBUG
        BytspotAviationFallbackTests.run()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ClipContentView()
                .environmentObject(invocation)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    invocation.handle(activity: activity)
                }
                .onOpenURL { url in
                    invocation.handle(url: url)
                }
                .task {
                    #if DEBUG
                    // Simulator recovery path: on iOS 26 the _XCAppClipURL
                    // argv is not consistently surfaced through
                    // onContinueUserActivity. Pull it directly from argv
                    // (or the explicit BYT_DEBUG_URL env override used by
                    // the screencap sweep) so the deep-link walkthrough is
                    // reachable.
                    guard invocation.invocationURL == nil else { return }
                    let env = ProcessInfo.processInfo.environment
                    if let raw = env["BYT_DEBUG_URL"] ?? env["_XCAppClipURL"],
                       let url = URL(string: raw) {
                        invocation.handle(url: url)
                        return
                    }
                    let argv = ProcessInfo.processInfo.arguments
                    if let idx = argv.firstIndex(of: "_XCAppClipURL"),
                       idx + 1 < argv.count,
                       let url = URL(string: argv[idx + 1]) {
                        invocation.handle(url: url)
                    }
                    #endif
                    try? await Task.sleep(nanoseconds: 750_000_000)
                    await requestEphemeralNotificationAuthorizationIfNeeded()
                }
        }
    }

    private func requestEphemeralNotificationAuthorizationIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .notDetermined else { return }
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
    }
}

#if false // Legacy Group domain retained only as source material for its future project; not compiled into this App Clip.
enum ClipGroupEventTimingState: String, Equatable {
    case now, today, thisWeek, weekly

    var eyebrow: String {
        switch self {
        case .now: return "LIVE NOW"
        case .today: return "TODAY"
        case .thisWeek: return "THIS WEEK"
        case .weekly: return "WEEKLY"
        }
    }
}

enum ClipPartyTemplate: String, Equatable {
    case listeningParty = "listening-party"
    case comedyNight = "comedy-night"
    case premiere
    case privateParty = "private-party"
    case fanMeetup = "fan-meetup"
    case releaseParty = "release-party"
    case popUp = "pop-up"

    var configurationKind: String {
        switch self {
        case .comedyNight, .premiere: return "standard"
        case .listeningParty: return "listening-party"
        case .privateParty: return "private-party"
        case .fanMeetup: return "fan-meetup"
        case .releaseParty: return "release-party"
        case .popUp: return "pop-up"
        }
    }
}

enum ClipPartyTemplateConfiguration: Equatable {
    case standard
    case listeningParty(format: String)
    case fanMeetup(format: String)
    case releaseParty(type: String, title: String)
    case popUp(locationDisclosure: String)
    case privateParty(guestPolicy: String)

    static func from(_ value: Any?, for template: ClipPartyTemplate?) -> Self? {
        guard let template, let row = value as? [String: Any], let kind = row["kind"] as? String,
              kind == template.configurationKind else { return nil }
        switch template {
        case .comedyNight, .premiere:
            return kind == "standard" ? .standard : nil
        case .listeningParty:
            guard let format = row["format"] as? String,
                  ["listening-session", "dj-mix-premiere", "live-performance", "label-showcase"].contains(format) else { return nil }
            return .listeningParty(format: format)
        case .fanMeetup:
            guard let format = row["format"] as? String,
                  ["meet-and-greet", "creator-conversation", "community-photo"].contains(format) else { return nil }
            return .fanMeetup(format: format)
        case .releaseParty:
            guard let type = row["releaseType"] as? String,
                  ["single", "ep", "album", "mix", "video"].contains(type),
                  let title = row["releaseTitle"] as? String,
                  (2...120).contains(title.trimmingCharacters(in: .whitespacesAndNewlines).count) else { return nil }
            return .releaseParty(type: type, title: title.trimmingCharacters(in: .whitespacesAndNewlines))
        case .popUp:
            guard let disclosure = row["locationDisclosure"] as? String,
                  ["public", "after-approval"].contains(disclosure) else { return nil }
            return .popUp(locationDisclosure: disclosure)
        case .privateParty:
            guard let policy = row["guestPolicy"] as? String,
                  ["named-guests", "named-guests-plus-one"].contains(policy) else { return nil }
            return .privateParty(guestPolicy: policy)
        }
    }
}

#endif

enum ClipPartyPassAction: String, Equatable {
    case authenticate
    case rsvp
    case requestApproval = "request-approval"
    case ticket
    case viewPass = "view-pass"
    case unavailable
}

enum ClipPartyHandoffProvider: String, Equatable {
    case uber
    case lyft
}

struct ClipPartyPassState: Equatable {
    let partyID: String
    let action: ClipPartyPassAction
    let guestStatus: String
    let accessGranted: Bool
    let premiumMobilityEligible: Bool

    init(partyID: String, action: ClipPartyPassAction, guestStatus: String, accessGranted: Bool, premiumMobilityEligible: Bool = false) {
        self.partyID = partyID
        self.action = action
        self.guestStatus = guestStatus
        self.accessGranted = accessGranted
        self.premiumMobilityEligible = premiumMobilityEligible
    }
}

struct ClipPartyTicketTier: Identifiable, Equatable {
    let name: String
    let priceCents: Int
    let quantity: Int
    let requiredMembershipTier: String

    var id: String { name }

    static func from(_ value: Any?) -> Self? {
        guard let row = value as? [String: Any],
              let rawName = row["name"] as? String,
              let priceCents = (row["priceCents"] as? NSNumber)?.intValue, priceCents > 0,
              let quantity = (row["quantity"] as? NSNumber)?.intValue, quantity > 0,
              let tier = row["requiredMembershipTier"] as? String,
              ["green", "platinum", "black"].contains(tier) else { return nil }
        let name = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...80).contains(name.count) else { return nil }
        return Self(name: name, priceCents: priceCents, quantity: quantity, requiredMembershipTier: tier)
    }
}

enum PartyHostDestinationKind: String, CaseIterable, Equatable {
    case music
    case merch
    case website
    case social

    var title: String {
        switch self {
        case .music: return "Music"
        case .merch: return "Merch"
        case .website: return "Website"
        case .social: return "Social"
        }
    }

    var symbol: String {
        switch self {
        case .music: return "music.note"
        case .merch: return "bag.fill"
        case .website: return "globe"
        case .social: return "person.crop.circle.fill"
        }
    }
}

struct PartyHostDestination: Identifiable, Equatable {
    let kind: PartyHostDestinationKind
    let label: String
    let url: URL

    // Ordered identity lists may carry several socials (distinct labels).
    var id: String { "\(kind.rawValue)-\(label)" }
}

/// The authoritative, Party-only representation used by `/party/<id>`.
/// It intentionally has no Group Event fallback, fields, or API semantics.
struct PartyPassInvite: Equatable {
    let id: String
    let title: String
    let tier: BytspotTier
    let hostName: String
    let scheduledDate: String
    let locationLabel: String
    let locationDisclosure: String
    let locationIsWithheld: Bool
    /// Present only for a published venue the server could resolve to a real
    /// point. Never populated for an after-approval or withheld Party.
    let latitude: Double?
    let longitude: Double?
    let accessMode: String
    let capacity: Int?
    let attendeeCount: Int
    let ticketTiers: [ClipPartyTicketTier]
    let itinerary: [String]
    let note: String?
    let hostDestinations: [PartyHostDestination]
    let hostHandle: String?
    let heroImageURL: URL?
    let thumbnailURL: URL?
    let photoURLs: [URL]

    /// Shown when the host published the venue but the server sent no name. It
    /// names no place, so it must never be handed to Maps.
    static let unnamedVenueLabel = "Location pending"

    /// Only a published, actually-named venue is routable. An after-approval or
    /// withheld Party must not leak through a maps query what its label hides.
    var routableVenueName: String? {
        guard !locationIsWithheld, locationLabel != Self.unnamedVenueLabel else { return nil }
        return locationLabel
    }

    /// A routable point, and only alongside a routable name. The name gate is
    /// re-applied here so a coordinate can never survive a disclosure the label
    /// already refused — two independent checks, not one shared assumption.
    var routableCoordinate: (latitude: Double, longitude: Double)? {
        guard routableVenueName != nil, let latitude, let longitude,
              latitude.isFinite, longitude.isFinite,
              (-90...90).contains(latitude), (-180...180).contains(longitude),
              !(latitude == 0 && longitude == 0) else { return nil }
        return (latitude, longitude)
    }

    var displayPosterURL: URL? { thumbnailURL ?? heroImageURL }
    var canonicalURL: URL? { URL(string: "https://bytspot.app/party/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)") }
    /// The only valid full-app/App Clip handoff for a Host Studio Party.
    /// Keep this independent of any vendor/service discovery route.
    var handoffURL: URL? {
        guard let encodedID = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed), !encodedID.isEmpty else { return nil }
        var components = URLComponents()
        components.scheme = "https"
        components.host = "bytspot.app"
        components.path = "/party/\(encodedID)"
        components.queryItems = [
            URLQueryItem(name: "source", value: "host-studio-party"),
            URLQueryItem(name: "handoff", value: "1")
        ]
        return components.url
    }

    static func partyID(from pathParts: [String]) -> String? {
        guard pathParts.count == 2, pathParts[0].lowercased() == "party" else { return nil }
        let id = pathParts[1].trimmingCharacters(in: .whitespacesAndNewlines)
        return id.isEmpty || id.count > 200 ? nil : id
    }

    /// A `/party/…` link is always a Party Pass. Malformed party paths fail
    /// as a party — never fall through to the patch/vendor catalog.
    enum Route: Equatable {
        case none
        case party(id: String)
        case invalid
    }

    static func fromPayload(_ value: Any) -> Self? {
        guard let row = value as? [String: Any],
              let id = string(row["id"]),
              let title = string(row["title"]),
              let tier = string(row["tier"]).flatMap(BytspotTier.init(rawValue:)),
              string(row["source"]) == "host-studio-party" else { return nil }
        let host = object(row["host"])
        // Old or malformed invites never reveal a venue. Keep the established
        // fail-closed compatibility state as after-approval; only an explicit
        // server-authored withheld policy renders the stronger withheld label.
        let locationDisclosure = ["public", "after-approval", "withheld"].contains(row["locationDisclosure"] as? String ?? "") ? (row["locationDisclosure"] as! String) : "after-approval"
        let locationIsPublic = locationDisclosure == "public"
        return Self(
            id: id, title: title, tier: tier,
            hostName: string(row["hostName"]) ?? string(row["host"]) ?? string(host?["name"]) ?? "Bytspot Host",
            scheduledDate: displayDate(string(row["scheduledDate"])) ?? "Schedule to be announced",
            locationLabel: locationIsPublic ? (string(row["locationLabel"]) ?? Self.unnamedVenueLabel) : locationDisclosure == "after-approval" ? "Location shared after approval" : "Location withheld by host",
            locationDisclosure: locationDisclosure,
            locationIsWithheld: !locationIsPublic,
            latitude: locationIsPublic ? double(row["latitude"]) : nil,
            longitude: locationIsPublic ? double(row["longitude"]) : nil,
            accessMode: string(row["accessMode"]) ?? "free-rsvp",
            capacity: int(row["capacity"]), attendeeCount: int(row["participantCount"]) ?? 0,
            ticketTiers: (row["ticketTiers"] as? [Any])?.compactMap(ClipPartyTicketTier.from) ?? [],
            itinerary: stringArray(row["activityHighlights"]) ?? stringArray(row["highlights"]) ?? [],
            note: string(row["inviteNote"]),
            hostDestinations: hostDestinations(host: host),
            hostHandle: string(host?["handle"]).map { "@\($0.hasPrefix("@") ? String($0.dropFirst()) : $0)" },
            heroImageURL: secureURL(row["heroImageURL"]),
            thumbnailURL: secureURL(row["thumbnailURL"]),
            photoURLs: ((row["photoURLs"] as? [Any]) ?? []).compactMap(secureURL).prefix(6).map { $0 }
        )
    }

    private static func string(_ value: Any?) -> String? {
        guard let value = value as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
    private static func int(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return nil
    }
    private static func double(_ value: Any?) -> Double? {
        if let value = value as? Double { return value }
        if let value = value as? NSNumber { return value.doubleValue }
        return nil
    }
    private static func object(_ value: Any?) -> [String: Any]? { value as? [String: Any] }
    private static func stringArray(_ value: Any?) -> [String]? {
        guard let values = value as? [Any] else { return nil }
        let strings = values.compactMap { item -> String? in
            string(item) ?? object(item).flatMap { string($0["title"]) ?? string($0["name"]) ?? string($0["label"]) }
        }
        return strings.isEmpty ? nil : strings
    }
    private static func secureURL(_ value: Any?) -> URL? {
        guard let value = string(value), let url = URL(string: value),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.scheme?.lowercased() == "https", components.host?.isEmpty == false else { return nil }
        return url
    }
    private static func hostDestinations(host: [String: Any]?) -> [PartyHostDestination] {
        // Prefer the ordered Official Host identity list. Labels are @handles
        // or display names — never raw URLs — and order is host-controlled.
        if let list = host?["destinationList"] as? [[String: Any]], !list.isEmpty {
            let socialKinds = ["instagram", "tiktok", "youtube", "x", "facebook", "linkedin"]
            return list.compactMap { entry in
                guard let rawKind = string(entry["kind"]), let label = string(entry["label"]),
                      !label.lowercased().hasPrefix("http"), let url = secureURL(entry["url"]) else { return nil }
                let kind: PartyHostDestinationKind
                if socialKinds.contains(rawKind) { kind = .social }
                else if let mapped = PartyHostDestinationKind(rawValue: rawKind) { kind = mapped }
                else { return nil }
                return PartyHostDestination(kind: kind, label: label, url: url)
            }
        }
        guard let source = object(host?["destinations"]) else { return [] }
        var results: [PartyHostDestination] = []
        if let url = secureURL(source["musicUrl"]) {
            results.append(PartyHostDestination(kind: .music, label: "Listen", url: url))
        }
        if let url = secureURL(source["merchUrl"]) {
            results.append(PartyHostDestination(kind: .merch, label: "Shop", url: url))
        }
        if let url = secureURL(source["websiteUrl"]) {
            results.append(PartyHostDestination(kind: .website, label: "Visit website", url: url))
        }
        let primarySocial = object(source["primarySocial"])
        if let socialURL = secureURL(primarySocial?["url"]), let socialLabel = string(primarySocial?["platform"]) {
            // Legacy platform text is untrusted: only a recognized platform
            // name renders; anything URL-like or unknown says Social.
            let known = ["instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube", "x": "X", "facebook": "Facebook", "linkedin": "LinkedIn"][socialLabel.lowercased()]
            results.append(PartyHostDestination(kind: .social, label: known ?? "Social", url: socialURL))
        }
        return results
    }
    private static func displayDate(_ value: String?) -> String? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        return date?.formatted(date: .abbreviated, time: .shortened) ?? value
    }
}

#if false // Legacy Group domain retained only as source material for its future project; not compiled into this App Clip.
struct ClipGroupEventInvite: Equatable {
    let id: String
    let title: String
    let tier: BytspotTier
    let timing: ClipGroupEventTimingState
    let participantCount: Int
    let capacity: Int?
    let accessMode: String?
    let ticketTiers: [ClipPartyTicketTier]
    let groupType: String
    let partyTemplate: ClipPartyTemplate?
    let partyTemplateConfig: ClipPartyTemplateConfiguration?
    let scheduledDate: String
    let hostName: String
    let locationLabel: String
    let theme: String
    let guestSummary: String
    let activityHighlights: [String]
    let audienceCircle: String
    let privacyStatus: String
    let locationDisclosure: String
    let rsvpCutoff: String?
    let requiresApproval: Bool
    let inviteNote: String?
    let videoURL: URL?
    let heroImageURL: URL?
    let thumbnailURL: URL?
    let photoURLs: [URL]
    let instagramHandle: String?
    let source: String

    var displayPosterURL: URL? { thumbnailURL ?? heroImageURL }
    var hasPlayableVideo: Bool { videoURL != nil }
    var isHostStudioParty: Bool { source == "host-studio-party" }
    var partyPassURL: URL? {
        guard isHostStudioParty else { return handoffURL }
        return URL(string: "https://bytspot.app/party/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)")
    }
    var handoffURL: URL? {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "bytspot.app"
        components.path = "/\(isHostStudioParty ? "party" : "group")/\(id)"
        if isHostStudioParty {
            components.queryItems = [
                URLQueryItem(name: "source", value: source),
                URLQueryItem(name: "handoff", value: "1")
            ]
            return components.url
        }
        components.queryItems = [
            URLQueryItem(name: "tier", value: tier.rawValue),
            URLQueryItem(name: "title", value: title),
            URLQueryItem(name: "type", value: groupType),
            URLQueryItem(name: "participants", value: "\(participantCount)"),
            URLQueryItem(name: "capacity", value: capacity.map(String.init)),
            URLQueryItem(name: "accessMode", value: accessMode),
            URLQueryItem(name: "timing", value: timing.rawValue),
            URLQueryItem(name: "scheduled", value: scheduledDate),
            URLQueryItem(name: "host", value: hostName),
            URLQueryItem(name: "location", value: locationLabel),
            URLQueryItem(name: "theme", value: theme),
            URLQueryItem(name: "guestSummary", value: guestSummary),
            URLQueryItem(name: "activities", value: activityHighlights.joined(separator: ",")),
            URLQueryItem(name: "circle", value: audienceCircle),
            URLQueryItem(name: "visibility", value: privacyStatus),
            URLQueryItem(name: "locationDisclosure", value: locationDisclosure),
            URLQueryItem(name: "rsvpCutoff", value: rsvpCutoff),
            URLQueryItem(name: "approval", value: requiresApproval ? "1" : "0"),
            URLQueryItem(name: "note", value: inviteNote),
            URLQueryItem(name: "hero", value: heroImageURL?.absoluteString),
            URLQueryItem(name: "thumbnail", value: thumbnailURL?.absoluteString),
            URLQueryItem(name: "photos", value: photoURLs.map { $0.absoluteString }.joined(separator: ",")),
            URLQueryItem(name: "video", value: videoURL?.absoluteString),
            URLQueryItem(name: "instagram", value: instagramHandle),
            URLQueryItem(name: "source", value: source),
            URLQueryItem(name: "handoff", value: "1")
        ].filter { $0.value?.isEmpty == false }
        return components.url
    }

    static func from(pathParts: [String], queryItems: [URLQueryItem], tier: BytspotTier) -> Self? {
        guard pathParts.count >= 2, pathParts[0].lowercased() == "group" else { return nil }
        let id = pathParts[1]
        let title = queryValue(in: queryItems, names: ["title", "event"]) ?? id.replacingOccurrences(of: "-", with: " ").split(separator: " ").map { $0.capitalized }.joined(separator: " ")
        let timingRaw = queryValue(in: queryItems, names: ["timing", "when"]) ?? "now"
        let timing = ClipGroupEventTimingState(rawValue: timingRaw) ?? .now
        let participantCount = Int(queryValue(in: queryItems, names: ["participants", "p"]) ?? "1") ?? 1
        let groupType = queryValue(in: queryItems, names: ["type", "groupType"]) ?? inferredGroupType(from: title)
        let fallback = tierFallback(tier: tier, timing: timing, participantCount: participantCount, groupType: groupType)
        let heroImageURL = queryURL(in: queryItems, names: ["hero", "heroImage", "heroImageUrl", "image"])
        let thumbnailURL = queryURL(in: queryItems, names: ["thumbnail", "thumbnailUrl", "poster", "posterUrl"]) ?? fallback.poster
        var seenPhotos = Set<URL>()
        let photoURLs = (queryURLs(in: queryItems, names: ["photos", "album", "gallery"]) ?? [heroImageURL, thumbnailURL].compactMap { $0 })
            .filter { seenPhotos.insert($0).inserted }
        return Self(
            id: id,
            title: title,
            tier: tier,
            timing: timing,
            participantCount: participantCount,
            capacity: Int(queryValue(in: queryItems, names: ["capacity"]) ?? ""),
            accessMode: queryValue(in: queryItems, names: ["accessMode", "access"]),
            ticketTiers: [],
            groupType: groupType,
            partyTemplate: nil,
            partyTemplateConfig: nil,
            scheduledDate: queryValue(in: queryItems, names: ["scheduled", "scheduledDate", "date", "startTime"]) ?? fallback.schedule,
            hostName: queryValue(in: queryItems, names: ["host", "hostName"]) ?? fallback.host,
            locationLabel: queryValue(in: queryItems, names: ["location", "locationLabel", "address"]) ?? fallback.location,
            theme: queryValue(in: queryItems, names: ["theme", "eventTheme"]) ?? fallback.theme,
            guestSummary: queryValue(in: queryItems, names: ["guestSummary", "guests"]) ?? fallback.guests,
            activityHighlights: queryArray(in: queryItems, names: ["activities", "activityHighlights", "highlights"]) ?? fallback.highlights,
            audienceCircle: queryValue(in: queryItems, names: ["circle", "audienceCircle", "audience"]) ?? (queryValue(in: queryItems, names: ["visibility"]) == "publicDiscovery" ? "Public" : "Close Friends"),
            privacyStatus: queryValue(in: queryItems, names: ["visibility", "privacy"]) ?? "privateInvite",
            locationDisclosure: queryValue(in: queryItems, names: ["locationDisclosure"]) ?? "public",
            rsvpCutoff: queryValue(in: queryItems, names: ["rsvpCutoff", "rsvpDeadline", "deadline"]),
            requiresApproval: ["1", "true", "approval"].contains((queryValue(in: queryItems, names: ["approval", "approvalMode", "requiresApproval"]) ?? "").lowercased()),
            inviteNote: queryValue(in: queryItems, names: ["note", "inviteNote", "description"]),
            videoURL: queryURL(in: queryItems, names: ["video", "videoUrl", "hls", "hlsUrl"]) ?? fallback.video,
            heroImageURL: heroImageURL,
            thumbnailURL: thumbnailURL,
            photoURLs: photoURLs,
            instagramHandle: normalizedInstagram(queryValue(in: queryItems, names: ["instagram", "ig", "instagramHandle", "social"])),
            source: queryValue(in: queryItems, names: ["source"]) ?? "group-event-link"
        )
    }

    static func partyID(from pathParts: [String]) -> String? {
        guard pathParts.count >= 2, pathParts[0].lowercased() == "party" else { return nil }
        let id = pathParts[1].trimmingCharacters(in: .whitespacesAndNewlines)
        return id.isEmpty ? nil : id
    }

    static func fromPartyPayload(_ value: Any) -> Self? {
        guard let row = value as? [String: Any],
              let id = cleanString(row["id"]),
              let title = cleanString(row["title"]),
              let tierRaw = cleanString(row["tier"])?.lowercased(),
              let tier = BytspotTier(rawValue: tierRaw),
              cleanString(row["source"])?.lowercased() == "host-studio-party" else { return nil }
        let timing = cleanString(row["timing"]).flatMap(ClipGroupEventTimingState.init(rawValue:)) ?? .thisWeek
        let scheduled = cleanString(row["scheduledDate"]).map(displaySchedule) ?? timing.eyebrow.capitalized
        let decodedTemplate = cleanString(row["templateId"]).flatMap(ClipPartyTemplate.init(rawValue:))
        let decodedTemplateConfig = ClipPartyTemplateConfiguration.from(row["templateConfig"], for: decodedTemplate)
        let template = decodedTemplateConfig == nil ? nil : decodedTemplate
        let templateProtectsLocation: Bool
        if case .popUp(let disclosure) = decodedTemplateConfig {
            templateProtectsLocation = disclosure != "public"
        } else {
            templateProtectsLocation = false
        }
        // Party locations are public only with an explicit public declaration.
        // Missing/malformed disclosure and a protected Pop-Up config both redact
        // the value client-side, even if a malformed DTO includes a venue label.
        let locationDisclosure = (row["locationDisclosure"] as? String) == "public" && !templateProtectsLocation
            ? "public"
            : "after-approval"
        let locationLabel = locationDisclosure == "public"
            ? cleanString(row["locationLabel"]) ?? "Location pending"
            : "Location shared after approval"
        return Self(
            id: id,
            title: title,
            tier: tier,
            timing: timing,
            participantCount: intValue(row["participantCount"]) ?? 0,
            capacity: intValue(row["capacity"]),
            accessMode: cleanString(row["accessMode"]),
            ticketTiers: (row["ticketTiers"] as? [Any])?.compactMap(ClipPartyTicketTier.from) ?? [],
            groupType: cleanString(row["groupType"]) ?? "Private Party",
            partyTemplate: template,
            partyTemplateConfig: decodedTemplateConfig,
            scheduledDate: scheduled,
            hostName: cleanString(row["hostName"]) ?? "Bytspot Host",
            locationLabel: locationLabel,
            theme: cleanString(row["theme"]) ?? "Host Studio Party",
            guestSummary: cleanString(row["guestSummary"]) ?? "Guest list open",
            activityHighlights: stringArray(row["activityHighlights"]),
            audienceCircle: cleanString(row["audienceCircle"]) ?? "Shared Party Pass",
            privacyStatus: cleanString(row["privacyStatus"]) ?? "privateInvite",
            locationDisclosure: locationDisclosure,
            rsvpCutoff: cleanString(row["rsvpCutoff"]),
            requiresApproval: boolValue(row["requiresApproval"]),
            inviteNote: cleanString(row["inviteNote"]),
            videoURL: cleanString(row["videoURL"]).flatMap(URL.init(string:)),
            heroImageURL: cleanString(row["heroImageURL"]).flatMap(URL.init(string:)),
            thumbnailURL: cleanString(row["thumbnailURL"]).flatMap(URL.init(string:)),
            photoURLs: stringArray(row["photoURLs"]).compactMap(URL.init(string:)),
            instagramHandle: normalizedInstagram(cleanString(row["instagramHandle"])),
            source: "host-studio-party"
        )
    }

    private static func displaySchedule(_ raw: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
        guard let date else { return raw }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private static func cleanString(_ value: Any?) -> String? {
        guard let value = value as? String else { return nil }
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }

    private static func intValue(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return cleanString(value).flatMap(Int.init)
    }

    private static func boolValue(_ value: Any?) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        return ["1", "true", "yes"].contains(cleanString(value)?.lowercased() ?? "")
    }

    private static func stringArray(_ value: Any?) -> [String] {
        if let values = value as? [String] { return values.filter { !$0.isEmpty } }
        return cleanString(value)?.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty } ?? []
    }

    private static func normalizedInstagram(_ raw: String?) -> String? {
        guard var handle = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !handle.isEmpty else { return nil }
        if let url = URL(string: handle), let host = url.host, host.lowercased().contains("instagram.com") {
            handle = url.path.split(separator: "/").first.map(String.init) ?? handle
        }
        handle = handle.replacingOccurrences(of: "@", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        return handle.isEmpty ? nil : handle
    }

    private static func queryValue(in items: [URLQueryItem], names: [String]) -> String? {
        let normalized = Set(names.map { $0.lowercased() })
        return items.first { item in normalized.contains(item.name.lowercased()) }?.value
    }

    private static func queryURL(in items: [URLQueryItem], names: [String]) -> URL? {
        queryValue(in: items, names: names).flatMap(URL.init(string:))
    }

    private static func queryArray(in items: [URLQueryItem], names: [String]) -> [String]? {
        guard let raw = queryValue(in: items, names: names) else { return nil }
        let values = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        return values.isEmpty ? nil : values
    }

    private static func queryURLs(in items: [URLQueryItem], names: [String]) -> [URL]? {
        guard let raw = queryValue(in: items, names: names) else { return nil }
        let urls = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.compactMap { URL(string: $0) }
        return urls.isEmpty ? nil : urls
    }

    private static func inferredGroupType(from title: String) -> String {
        let lower = title.lowercased()
        if lower.contains("family") { return "Family" }
        if lower.contains("dinner") { return "Dinner" }
        if lower.contains("birthday") { return "Birthday" }
        return "Private"
    }

    private static func tierFallback(tier: BytspotTier, timing: ClipGroupEventTimingState, participantCount: Int, groupType: String) -> (schedule: String, host: String, location: String, theme: String, guests: String, highlights: [String], video: URL?, poster: URL?) {
        let schedule = timing == .now ? "Tonight · live now" : timing.eyebrow.capitalized
        let guests = "\(participantCount) joined · invite-only"
        let privateType = groupType.isEmpty ? "Private" : groupType
        switch tier {
        case .black:
            return (schedule, "Bytspot Black Host", "Private arrival lounge", "Elite Guarantee · \(privateType)", guests, ["48h+ live window", "42+ guest capacity", "Concierge verified"], previewLoopURL(), URL(string: "https://bytspot.app/media/app-clip/black-private-group-poster.jpg"))
        case .platinum:
            return (schedule, "Platinum Dinner Host", "Host-selected table", "Premium \(privateType.lowercased())", guests, ["12h live window", "Up to 12 guests", "Host-led arrival"], previewLoopURL(), URL(string: "https://bytspot.app/media/app-clip/platinum-private-group-poster.jpg"))
        case .green:
            return (schedule, "Neighborhood Host", "Local private spot", "Local \(privateType.lowercased())", guests, ["2h local window", "Up to 5 guests", "Neighbor verified"], nil, URL(string: "https://bytspot.app/media/app-clip/green-private-group-poster.jpg"))
        }
    }

    private static func previewLoopURL() -> URL? {
        #if DEBUG
        return URL(string: "https://stream.mux.com/maGUgL01ahB3014Aatfpkmlmni02DTaWvb.m3u8")
        #else
        return nil
        #endif
    }
}

/// Host Studio Parties use only Party-specific server contracts. Legacy Group
/// Event APIs cannot be a fallback because they have different eligibility.
enum ClipPartyPassActionPolicy {
    static func usesLegacyGroupEventRoute(for invite: ClipGroupEventInvite) -> Bool {
        !invite.isHostStudioParty
    }
}

#endif

enum ClipFlowStep: Equatable {
    case catalog
    case partyLoading(partyID: String)
    case partyFailed(partyID: String, message: String)
    case party(PartyPassInvite)
    case vendors(service: ClipLocalService)
    case checkout(service: ClipLocalService, vendor: ClipVendor)
    case success(service: ClipLocalService, vendor: ClipVendor, bookingRef: String, amountCents: Int)
}

#if DEBUG
/// Supplies a deterministic access state only for the explicit simulator Party
/// walkthrough. Real Party links must always be resolved by the server.
enum ClipPartyPassPreview {
    static func state(for invocationURL: URL?, partyID: String) -> ClipPartyPassState? {
        guard let invocationURL,
              let components = URLComponents(url: invocationURL, resolvingAgainstBaseURL: false),
              partyID == "party-preview-1",
              components.path.isEmpty || components.path == "/",
              let step = components.queryItems?.first(where: { $0.name == "step" })?.value?.lowercased(),
              ["party_loop", "host_party", "host_studio_party"].contains(step) else { return nil }
        let requestedAction = components.queryItems?.first(where: { $0.name == "previewAction" })?.value.flatMap(ClipPartyPassAction.init(rawValue:))
        let action = requestedAction.flatMap { [.rsvp, .requestApproval, .ticket, .viewPass, .unavailable].contains($0) ? $0 : nil } ?? .rsvp
        let guestStatus = action == .unavailable ? "pending" : action == .viewPass ? "joined" : "not_joined"
        return ClipPartyPassState(partyID: partyID, action: action, guestStatus: guestStatus, accessGranted: action == .viewPass)
    }

    static func confirmedRSVP(for invocationURL: URL?, partyID: String) -> ClipPartyPassState? {
        guard state(for: invocationURL, partyID: partyID)?.action == .rsvp else { return nil }
        return ClipPartyPassState(partyID: partyID, action: .viewPass, guestStatus: "joined", accessGranted: true)
    }
}
#endif

enum ClipVendorFilter: String, CaseIterable, Identifiable {
    case now = "Now"
    case tonight = "Tonight"
    case thisWeek = "This Week"
    var id: String { rawValue }
}

@MainActor
final class ClipInvocationModel: ObservableObject {
    @Published var venueSlug: String?
    @Published var patchId: String?
    @Published var token: String?
    @Published var invocationURL: URL?
    /// Retained across checkout/success transitions so Party sharing never
    /// falls back to a vendor or generic access URL.
    @Published private(set) var partyShareURL: URL?
    @Published var patchContext: ClipPatchContext?
    @Published var tier: BytspotTier = .black
    @Published var services: [ClipLocalService] = ClipLocalService.fallbacks(for: .black)
    @Published var isLoadingContext = false
    @Published var isLoadingServices = false
    @Published var verificationState: ClipVerifyState = .idle
    @Published var contextError: String?

    @Published var flow: ClipFlowStep = .catalog
    @Published var vendorsByService: [String: [ClipVendor]] = [:]
    @Published var loadingVendorsService: String?
    @Published var vendorFilter: ClipVendorFilter = .now
    @Published var guestCount: Int = 1
    @Published var lineItemQuantities: [String: Int] = [:]
    @Published private(set) var selectedPartyTicketTier: ClipPartyTicketTier?

    private let api = ClipPatchVerifier()
    private var loadTask: Task<Void, Never>?
    private var vendorTasks: [String: Task<Void, Never>] = [:]

    var hasPremiumMembershipAccess: Bool { tier == .black || tier == .platinum }

    var membershipGateMessage: String {
        hasPremiumMembershipAccess ? "Premium membership verified for service booking." : "Premium membership required to browse and book App Clip service vendors."
    }

    func handle(activity: NSUserActivity) {
        guard let url = activity.webpageURL else { return }
        handle(url: url)
    }

    func handle(url: URL) {
        loadTask?.cancel()
        vendorTasks.values.forEach { $0.cancel() }
        vendorTasks.removeAll()

        invocationURL = url
        partyShareURL = nil
        flow = .catalog
        vendorFilter = .now
        guestCount = 1
        resetLineItems()
        selectedPartyTicketTier = nil
        patchContext = nil
        verificationState = .idle
        contextError = nil
        loadingVendorsService = nil
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        let items = components.queryItems ?? []
        let pathParts = Self.pathParts(from: components)

        #if DEBUG
        if let previewAPI = Self.queryValue(in: items, names: ["debugPreviewAPI"]) {
            UserDefaults.standard.set(previewAPI == "1", forKey: ClipPatchVerifier.debugPreviewAPIKey)
        }
        #endif

        // Apple's default App Clip link (appclip.apple.com/id?p=<bundleID>) is the
        // only invocation a shared web link can reliably produce, because a link
        // on bytspot.app cannot open a Clip for bytspot.app. On that host `p` is
        // the Clip bundle ID, not a patch, so it must not be read as one.
        let isDefaultAppClipLink = components.host?.lowercased() == Self.appClipDefaultLinkHost
        venueSlug = Self.queryValue(in: items, names: ["venue", "venuename", "v"])
        patchId = (isDefaultAppClipLink
            ? Self.queryValue(in: items, names: ["patch", "patchid"])
            : Self.queryValue(in: items, names: ["patch", "patchid", "p"]))
            ?? Self.patchId(from: pathParts)
        token = Self.queryValue(in: items, names: ["t", "token"])

        let detectedTier = BytspotTier.detect(url: url, patchId: patchId)
        tier = detectedTier
        switch Self.partyRoute(from: pathParts, queryItems: items, isDefaultAppClipLink: isDefaultAppClipLink) {
        case .party(let partyID):
            flow = .partyLoading(partyID: partyID)
            isLoadingContext = true
            loadTask = Task { [weak self] in await self?.loadPartyInvite(partyID: partyID) }
            return
        case .invalid:
            flow = .partyFailed(partyID: "", message: "This Party Pass link is invalid. Ask the host for a fresh link.")
            return
        case .none:
            break
        }
        // Reset catalog/vendor caches when the tier changes so stale luxury
        // entries never leak into a Green/Platinum invocation.
        services = ClipLocalService.fallbacks(for: detectedTier)
        vendorsByService.removeAll()
        if let explicitService = ClipLocalService.explicitService(for: url, tier: detectedTier) {
            if let existingIndex = services.firstIndex(where: { $0.id == explicitService.id }) {
                services.remove(at: existingIndex)
            }
            services.insert(explicitService, at: 0)
            let fallbackVendors = ClipVendor.fallbacks(for: explicitService, tier: detectedTier)
            vendorsByService[explicitService.id] = fallbackVendors
            if let explicitVendor = ClipVendor.explicitVendor(for: url, service: explicitService, tier: detectedTier) {
                flow = .checkout(service: explicitService, vendor: explicitVendor)
            }
        }

        #if DEBUG
        // Deep-link walkthrough hook used by scripts/clip-screencap-sweep.sh
        // to fast-forward the flow state machine for the TestFlight pre-flight
        // screenshot gallery. Stripped from Release builds entirely.
        if let step = items.first(where: { $0.name == "step" })?.value,
           applyDebugWalkthrough(step: step) {
            return
        }
        #endif

        guard let patchId else { return }
        let token = token
        loadTask = Task { [weak self] in
            await self?.loadContextAndVerify(patchId: patchId, token: token)
        }
    }

    /// Universal Link used when the Clip hands off to the installed full app.
    /// If the full app is not installed, the view layer falls back to SKOverlay.
    /// `handoff=1` is already carried by `handoffURL`; the wallet intent is added
    /// only on the ticket path, so a plain "Open in Bytspot" never claims a save
    /// the guest did not ask for.
    var mainAppHandoffURL: URL? {
        if case .party(let invite) = flow {
            guard var components = URLComponents(url: invite.handoffURL ?? URL(string: "https://bytspot.app/party/")!, resolvingAgainstBaseURL: false),
                  components.host == "bytspot.app", components.path.hasPrefix("/party/"),
                  let selectedPartyTicketTier else { return invite.handoffURL }
            var queryItems = components.queryItems ?? []
            queryItems.append(contentsOf: [
                URLQueryItem(name: "ticketTier", value: selectedPartyTicketTier.name),
                URLQueryItem(name: "ticketTierCents", value: String(selectedPartyTicketTier.priceCents)),
                URLQueryItem(name: "ticketTierAccess", value: selectedPartyTicketTier.requiredMembershipTier),
                URLQueryItem(name: "intent", value: "save_to_wallet")
            ])
            if let coordinate = invite.routableCoordinate {
                queryItems.append(contentsOf: [
                    URLQueryItem(name: "lat", value: String(coordinate.latitude)),
                    URLQueryItem(name: "lng", value: String(coordinate.longitude))
                ])
            }
            components.queryItems = queryItems
            return components.url
        }
        let resolvedPatchId = patchId ?? patchContext?.patchId
        var components = URLComponents()
        components.scheme = "https"
        components.host = "bytspot.app"
        if let resolvedPatchId, !resolvedPatchId.isEmpty {
            components.path = "/access/\(resolvedPatchId)"
        } else {
            components.path = "/"
        }
        var queryItems = [
            URLQueryItem(name: "tier", value: tier.rawValue),
            URLQueryItem(name: "source", value: "app_clip"),
            URLQueryItem(name: "handoff", value: "1")
        ]
        if let token, !token.isEmpty {
            queryItems.append(URLQueryItem(name: "t", value: token))
        }
        if let venue = venueSlug ?? patchContext?.title, !venue.isEmpty {
            queryItems.append(URLQueryItem(name: "venue", value: venue))
        }
        components.queryItems = queryItems
        return components.url
    }

    #if DEBUG
    /// Synchronously advances `flow` to the requested step using the locally
    /// resolved tier fallback catalog + vendor pool. Returns `true` when the
    /// hook handled the URL (so the live backend resolve is skipped, keeping
    /// the screenshot deterministic). Returns `false` for `catalog` / unknown
    /// values so the regular `loadContextAndVerify` path still runs.
    private func applyDebugWalkthrough(step: String) -> Bool {
        switch step.lowercased() {
        case "catalog":
            flow = .catalog
            return true
        case "party_loop", "host_party", "host_studio_party":
            let payload: [String: Any] = [
                "id": "party-preview-1", "source": "host-studio-party", "title": "First Listen",
                "inviteNote": "One moment. Your people.", "tier": tier.rawValue, "timing": "thisWeek",
                "participantCount": 3, "capacity": 80, "accessMode": "free-rsvp",
                "templateId": "listening-party", "templateConfig": ["kind": "listening-party", "format": "listening-session"],
                "groupType": "Listening Party", "scheduledDate": "2026-08-10T20:00:00Z",
                "hostName": "Demo Host", "locationLabel": "Preview Venue", "locationDisclosure": "public",
                "host": ["destinations": ["musicUrl": "https://music.example.com/demo", "merchUrl": "https://shop.example.com/demo", "websiteUrl": "https://demo.example.com", "primarySocial": ["platform": "Instagram", "url": "https://instagram.com/demo"]]],
                "theme": "One moment. Your people.", "guestSummary": "3 joined · 80 spots",
                "activityHighlights": ["Doors open", "First listen", "Artist Q&A"],
                "audienceCircle": "Selected Circles", "privacyStatus": "privateInvite",
                "requiresApproval": false,
                "ticketTiers": [["name": "First Drop", "priceCents": 2500, "quantity": 40, "requiredMembershipTier": "green"], ["name": "Listening Room", "priceCents": 4500, "quantity": 12, "requiredMembershipTier": "green"]]
            ]
            guard let invite = PartyPassInvite.fromPayload(payload) else { return false }
            tier = invite.tier
            flow = .party(invite)
            return true
        case "vendors":
            guard let service = services.first else { return false }
            selectService(service)
            return true
        case "checkout":
            guard let service = services.first else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .checkout(service: service, vendor: vendor)
            return true
        case "checkout_broni", "broni_checkout", "broni_home_taste":
            let catalog = services + ClipLocalService.fallbacks(for: .platinum)
            guard let service = catalog.first(where: { service in
                let text = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
                return text.contains("dining") || text.contains("food") || text.contains("table")
            }) else { return false }
            let fallbacks = ClipVendor.fallbacks(for: service, tier: .platinum)
            guard let vendor = fallbacks.first(where: { $0.name.lowercased().contains("broni") }) else { return false }
            vendorsByService[service.id] = fallbacks
            flow = .checkout(service: service, vendor: vendor)
            return true
        case "success":
            guard let service = services.first else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .success(service: service, vendor: vendor, bookingRef: "BYT-PREVIEW-0001", amountCents: vendor.priceFromCents)
            return true
        case "success_marine", "marine_success":
            guard let service = services.first(where: { service in
                let text = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
                return text.contains("black-marine") || text.contains("marine") || text.contains("yacht") || text.contains("vessel")
            }) else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .success(service: service, vendor: vendor, bookingRef: "BYT-MARINE-0001", amountCents: vendor.priceFromCents)
            return true
        case "success_gh_akwaaba", "success_fifa_matchday", "success_platinum_fifa":
            let service = ClipLocalService.platinumEventAccessService()
            let fallbacks = ClipVendor.fallbacks(for: service, tier: tier)
            guard let vendor = fallbacks.first(where: { $0.name.lowercased().contains("akwaaba") }) ?? fallbacks.first else { return false }
            vendorsByService[service.id] = fallbacks
            flow = .success(service: service, vendor: vendor, bookingRef: "GH-AKWAABA-0001", amountCents: vendor.priceFromCents)
            return true
        case "success_platinum_event", "platinum_event_success":
            guard let service = services.first(where: { service in
                let text = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
                return text.contains("platinum-entry") || text.contains("event") || text.contains("entry") || text.contains("ticket") || text.contains("pass") || text.contains("fifa") || text.contains("matchday") || text.contains("nightlife") || text.contains("bottle") || text.contains("akwaaba")
            }) else { return false }
            let vendor = ClipVendor.fallbacks(for: service, tier: tier).first
                ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
            flow = .success(service: service, vendor: vendor, bookingRef: "PLATINUM-EVENT-0001", amountCents: vendor.priceFromCents)
            return true
        case "success_platinum_nightlife", "platinum_nightlife_success", "success_platinum_bottle":
            guard let service = services.first(where: { service in
                let text = [service.id, service.title, service.category ?? ""].joined(separator: " ").lowercased()
                return text.contains("nightlife") || text.contains("bottle")
            }) else { return false }
            let fallbacks = ClipVendor.fallbacks(for: service, tier: tier)
            let vendor = fallbacks.first ?? vendors(for: service).first
            guard let vendor else { return false }
            vendorsByService[service.id] = fallbacks
            flow = .success(service: service, vendor: vendor, bookingRef: "PLATINUM-EVENT-0001", amountCents: vendor.priceFromCents)
            return true
        case "black_ride", "ride", "valet":
            openValetBoutiqueServices()
            return true
        default:
            return false
        }
    }
    #endif

    func selectService(_ service: ClipLocalService) {
        guard hasPremiumMembershipAccess else {
            contextError = membershipGateMessage
            return
        }
        flow = .vendors(service: service)
        prefetchVendors(for: service)
    }

    func selectVendor(_ vendor: ClipVendor, service: ClipLocalService) {
        guard hasPremiumMembershipAccess else {
            contextError = membershipGateMessage
            return
        }
        guestCount = max(guestCount, 1)
        flow = .checkout(service: service, vendor: vendor)
    }

    func selectPartyTicketTier(_ ticketTier: ClipPartyTicketTier, partyID: String) {
        guard case .party(let invite) = flow,
              invite.id == partyID,
              invite.ticketTiers.contains(ticketTier) else { return }
        selectedPartyTicketTier = ticketTier
    }

    func completeCheckout(service: ClipLocalService, vendor: ClipVendor, bookingRef: String, amountCents: Int) {
        flow = .success(service: service, vendor: vendor, bookingRef: bookingRef, amountCents: amountCents)
    }

    func openValetBoutiqueServices() {
        let catalog = services + ClipLocalService.fallbacks(for: tier)
        guard let service = catalog.first(where: Self.isRideLogisticsService) else {
            flow = .catalog
            return
        }
        flow = .vendors(service: service)
        prefetchVendors(for: service)
    }

    func backToCatalog() {
        flow = .catalog
    }

    func backToVendors(service: ClipLocalService) {
        flow = .vendors(service: service)
    }

    func incrementGuests() { guestCount = min(guestCount + 1, 12) }
    func decrementGuests() { guestCount = max(guestCount - 1, 1) }

    func quantity(for item: ClipLineItem) -> Int {
        lineItemQuantities[item.id] ?? item.defaultQuantity
    }

    func adjustLineItem(_ item: ClipLineItem, delta: Int) {
        let next = min(max(quantity(for: item) + delta, item.minQuantity), item.maxQuantity)
        lineItemQuantities[item.id] = next
        guestCount = max(totalLineItemQuantity(), 1)
    }

    func totalLineItemQuantity(_ items: [ClipLineItem]? = nil) -> Int {
        let source = items ?? lineItemQuantities.map { ClipLineItem(id: $0.key, label: $0.key, amountCents: 0, defaultQuantity: $0.value, minQuantity: 0, maxQuantity: 999) }
        return source.reduce(0) { $0 + quantity(for: $1) }
    }

    func resetLineItems() {
        lineItemQuantities.removeAll()
        guestCount = 1
    }

    func prefetchVendors(for service: ClipLocalService, force: Bool = false) {
        if vendorsByService[service.id] != nil && !force { return }
        if vendorTasks[service.id] != nil { return }
        if vendorsByService[service.id] == nil || force {
            vendorsByService[service.id] = ClipVendor.fallbacks(for: service, tier: tier)
        }
        loadingVendorsService = service.id
        let patchId = self.patchId
        let tier = self.tier
        vendorTasks[service.id] = Task { [weak self] in
            let live = (try? await self?.api.searchVendors(service: service, patchId: patchId, tier: tier)) ?? []
            guard let self else { return }
            if !live.isEmpty {
                self.vendorsByService[service.id] = live
                self.refreshFlow(service: service, liveVendors: live)
            }
            if self.loadingVendorsService == service.id { self.loadingVendorsService = nil }
            self.vendorTasks[service.id] = nil
        }
    }

    func vendors(for service: ClipLocalService) -> [ClipVendor] {
        vendorsByService[service.id] ?? ClipVendor.fallbacks(for: service, tier: tier)
    }

    func verifyCurrentToken() {
        guard let token, !token.isEmpty else { return }
        Task { await verify(token: token) }
    }

    private func loadPartyInvite(partyID: String) async {
        defer { isLoadingContext = false; loadTask = nil }
        do {
            let invite = try await api.partyInvite(partyID: partyID)
            try Task.checkCancellation()
            tier = invite.tier
            partyShareURL = invite.canonicalURL
            flow = .party(invite)
        } catch is CancellationError {
            return
        } catch {
            flow = .partyFailed(partyID: partyID, message: "This Party Pass could not be loaded.")
        }
    }

    private func loadContextAndVerify(patchId: String, token: String?) async {
        verificationState = .idle
        contextError = nil
        isLoadingContext = true
        isLoadingServices = true
        let activeTier = tier
        services = ClipLocalService.fallbacks(for: activeTier)

        let patchPayload = try? await api.getByPatch(patchId: patchId, tier: activeTier)
        let resolvedContext: ClipPatchContext?
        if let context = patchPayload?.context {
            resolvedContext = context
        } else {
            resolvedContext = try? await api.resolvePatch(patchId: patchId, tier: activeTier)
        }
        let searchedServices = (try? await api.searchServices(patchId: patchId, tier: activeTier)) ?? []
        var resolvedServices = searchedServices
        if let service = patchPayload?.service {
            resolvedServices.removeAll { $0.id == service.id }
            resolvedServices.insert(service, at: 0)
        }
        if Task.isCancelled { return }

        patchContext = resolvedContext
        if let resolvedContext {
            // Backend authority over the visual tier — re-skin if it differs
            // from the URL-derived guess.
            if resolvedContext.tier != tier {
                tier = resolvedContext.tier
            }
            if venueSlug == nil {
                venueSlug = resolvedContext.title
            }
        }
        if !resolvedServices.isEmpty {
            services = resolvedServices
        } else if tier != activeTier {
            // Tier changed during resolve; refresh the curated fallback set.
            services = ClipLocalService.fallbacks(for: tier)
        }
        isLoadingContext = false
        isLoadingServices = false

        if resolvedContext == nil {
            contextError = "Live venue context is unavailable. Showing curated local services."
        }
        if let first = services.first {
            prefetchVendors(for: first)
        }
        await refreshPreselectedCheckout(patchPayload: patchPayload)
        if let token, !token.isEmpty {
            await verify(token: token)
        }
    }

    private func refreshPreselectedCheckout(patchPayload: ClipPatchVendorPayload?) async {
        guard case .checkout(let currentService, let currentVendor) = flow else { return }
        let liveService = patchPayload?.service ?? services.first(where: { $0.id == currentService.id }) ?? currentService
        if let liveVendor = patchPayload?.vendor {
            vendorsByService[liveService.id] = [liveVendor]
            flow = .checkout(service: liveService, vendor: liveVendor)
            return
        }
        let liveVendors = (try? await api.searchVendors(service: liveService, patchId: patchId, tier: tier)) ?? []
        guard !liveVendors.isEmpty else { return }
        vendorsByService[liveService.id] = liveVendors
        let selected = liveVendors.first(where: { $0.id == currentVendor.id })
            ?? liveVendors.first(where: { $0.name.caseInsensitiveCompare(currentVendor.name) == .orderedSame })
            ?? liveVendors.first
        if let selected {
            flow = .checkout(service: liveService, vendor: selected)
        }
    }

    private func refreshFlow(service: ClipLocalService, liveVendors: [ClipVendor]) {
        guard case .checkout(let currentService, let currentVendor) = flow,
              currentService.id == service.id else { return }
        let selected = liveVendors.first(where: { $0.id == currentVendor.id })
            ?? liveVendors.first(where: { $0.name.caseInsensitiveCompare(currentVendor.name) == .orderedSame })
            ?? liveVendors.first
        if let selected {
            flow = .checkout(service: service, vendor: selected)
        }
    }

    private func verify(token: String) async {
        verificationState = .verifying
        do {
            let result = try await api.verify(token: token)
            let label = patchContext?.title ?? result.patch.label ?? venueSlug ?? "Bytspot Access"
            verificationState = Self.verificationState(for: result, label: label)
        } catch {
            let msg: String
            switch error {
            case ClipPatchVerifier.VerifyError.missingToken: msg = "No secure token was included in this tap."
            case ClipPatchVerifier.VerifyError.server(let m): msg = m
            case ClipPatchVerifier.VerifyError.network(let m): msg = m
            default: msg = "Could not verify this patch. Try again."
            }
            verificationState = .unavailable(message: msg)
        }
    }

    nonisolated static func verificationState(for result: ClipPatchVerifier.VerifyResult, label: String) -> ClipVerifyState {
        let status = result.patch.status.lowercased()
        if !result.verified || ["denied", "revoked", "expired", "disabled", "inactive"].contains(status) {
            return .denied(message: "This secure tap did not grant access.")
        }
        if ["pending", "provisioning", "review"].contains(status) {
            return .pending(label: label, status: result.patch.status)
        }
        if ["active", "verified", "enabled"].contains(status) {
            return .success(label: label, bindingType: result.binding?.type)
        }
        return .denied(message: "This pass returned an unsupported status and was not accepted.")
    }

    private static func isRideLogisticsService(_ service: ClipLocalService) -> Bool {
        let text = [service.id, service.title, service.action, service.category ?? ""]
            .joined(separator: " ")
            .lowercased()
        return text.contains("valet")
            || text.contains("chauffeur")
            || text.contains("rideshare")
            || text.contains("ride")
            || text.contains("transport")
    }

    private static func patchId(from pathParts: [String]) -> String? {
        guard !pathParts.isEmpty else { return nil }
        let routeNames = Set(["access", "p", "patch", "t"])
        if pathParts.count >= 2, routeNames.contains(pathParts[0]) {
            return pathParts[1]
        }
        if pathParts.count == 1, pathParts[0].count >= 8 {
            return pathParts[0]
        }
        return nil
    }

    static let appClipDefaultLinkHost = "appclip.apple.com"

    nonisolated static func partyRoute(
        from pathParts: [String],
        queryItems: [URLQueryItem] = [],
        isDefaultAppClipLink: Bool = false
    ) -> PartyPassInvite.Route {
        // A default App Clip link carries no /party/ path, so the party is named
        // by query parameter instead. Social shares reach the Clip this way.
        if isDefaultAppClipLink, let raw = queryValue(in: queryItems, names: ["partyid", "party"]) {
            let id = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            return id.isEmpty || id.count > 200 ? .invalid : .party(id: id)
        }
        guard pathParts.first?.lowercased() == "party" else { return .none }
        guard let partyID = PartyPassInvite.partyID(from: pathParts) else { return .invalid }
        return .party(id: partyID)
    }

    private static func pathParts(from components: URLComponents) -> [String] {
        var parts = components.path.split(separator: "/").map(String.init)
        let scheme = components.scheme?.lowercased()
        if scheme != "http", scheme != "https", let host = components.host, !host.isEmpty {
            parts.insert(host, at: 0)
        }
        return parts
    }

    // Pure query-string lookup with no actor state; `partyRoute` is nonisolated
    // so route parsing stays testable off the main actor.
    nonisolated private static func queryValue(in items: [URLQueryItem], names: Set<String>) -> String? {
        items.first { names.contains($0.name.lowercased()) }?.value
    }
}
