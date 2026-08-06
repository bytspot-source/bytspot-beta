import SwiftUI
import UIKit
import PhotosUI

struct NativeHostStudioView: View {
    private enum Step: Int, CaseIterable { case spark, build, door, invite }

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    let circles: [NativeSocialCircle]
    let membershipTier: BytspotTier

    @State private var step: Step = .spark
    @State private var templateID: NativePartyTemplateID = .listeningParty
    @State private var title = ""
    @State private var tagline = "One moment. Your people."
    @State private var startsAt = Self.defaultStart
    @State private var venueName = ""
    @State private var capacity = "80"
    @State private var accessMode: NativePartyAccessMode = .freeRSVP
    @State private var requiredTier: BytspotTier = .green
    @State private var admissionPrice = "25"
    @State private var selectedCircleIDs: Set<String> = []
    @State private var teammateEmail = ""
    @State private var teammateRole: NativePartyHostRole = .cohost
    @State private var listeningFormat: NativeListeningPartyFormat = .listeningSession
    @State private var fanMeetupFormat: NativeFanMeetupFormat = .meetAndGreet
    @State private var releaseFormat: NativeReleaseFormat = .single
    @State private var releaseTitle = ""
    @State private var popUpLocationDisclosure: NativePopUpLocationDisclosure = .public
    @State private var privateGuestPolicy: NativePrivatePartyGuestPolicy = .namedGuests
    @State private var creatorLinks: [NativePartyCreatorLink] = []
    @State private var creatorLinkKind: NativePartyCreatorLinkKind = .music
    @State private var creatorLinkTitle = ""
    @State private var creatorLinkURL = ""
    @State private var isPublishing = false
    @State private var publishedParty: NativePublishedParty?
    @State private var message = ""
    @State private var publishTask: Task<Void, Never>?
    @State private var idempotencyKey = UUID().uuidString.lowercased()
    @State private var coverMedia: NativePartyPendingImage?
    @State private var albumMedia: [NativePartyPendingImage] = []
    @State private var showCoverPicker = false
    @State private var showAlbumPicker = false

    private static var defaultStart: Date {
        Calendar.current.date(bySettingHour: 20, minute: 0, second: 0, of: Date().addingTimeInterval(86_400)) ?? Date().addingTimeInterval(86_400)
    }

    private var template: NativePartyTemplate {
        NativePartyTemplate.catalog.first { $0.id == templateID } ?? NativePartyTemplate.catalog[0]
    }

    private var displayTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? template.name : title }

    var body: some View {
        ZStack {
            BytspotNativeBackground(tier: requiredTier).ignoresSafeArea()
            VStack(spacing: 0) {
                header
                if let publishedParty { partyPass(publishedParty) }
                else { studio }
            }
        }
        .preferredColorScheme(.dark)
        .accessibilityIdentifier("native-host-studio")
        .onChange(of: sessionStore.token ?? "") { _ in
            guard isPublishing else { return }
            publishTask?.cancel()
            isPublishing = false
            message = NativePartyStudioError.sessionChanged.localizedDescription
        }
        .onDisappear { publishTask?.cancel() }
        .sheet(isPresented: $showCoverPicker) {
            NativePartyPhotoPicker(selectionLimit: 1) { images in setCoverImage(images.first) }
        }
        .sheet(isPresented: $showAlbumPicker) {
            NativePartyPhotoPicker(selectionLimit: max(1, 6 - albumMedia.count)) { images in addAlbumImages(images) }
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
            Text(membershipTier.displayName.uppercased()).font(.system(size: 9, weight: .black)).foregroundColor(BytspotTheme.accent(for: membershipTier)).padding(.horizontal, 9).frame(height: 28).background(BytspotTheme.accent(for: membershipTier).opacity(0.13)).clipShape(Capsule())
        }
        .padding(.horizontal, 18).frame(height: 58).background(Color.black.opacity(0.72))
    }

    private var studio: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                progress
                hero
                stepContent
                if !message.isEmpty { Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.orange).accessibilityIdentifier("native-host-studio-message") }
                navigationButtons
            }
            .padding(.horizontal, 18).padding(.top, 14).padding(.bottom, 34)
        }
    }

    private var progress: some View {
        HStack(spacing: 7) {
            ForEach(Array(Step.allCases.enumerated()), id: \.offset) { index, item in
                VStack(spacing: 5) {
                    Capsule().fill(index <= step.rawValue ? NativeTheme.pink : Color.white.opacity(0.12)).frame(height: 4)
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
            sectionHeading("SPARK THE VIBE", "What are we making?", "Pick a feeling. We build the night around it.")
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(NativePartyTemplate.catalog) { item in
                    Button(action: { nativeImpactLight(); selectTemplate(item.id) }) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(item.emoji).font(.system(size: 27)); Text(item.name).font(.system(size: 14, weight: .black)); Text(item.hook).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.55)).lineLimit(2)
                        }.frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading).padding(13).background(templateID == item.id ? NativeTheme.pink.opacity(0.16) : Color.white.opacity(0.055)).overlay(RoundedRectangle(cornerRadius: 19).stroke(templateID == item.id ? NativeTheme.pink : Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 19))
                    }.buttonStyle(.plain).accessibilityLabel(item.name)
                }
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
            creatorLinksEditor
            DatePicker("Party date and time", selection: $startsAt, displayedComponents: [.date, .hourAndMinute]).font(.system(size: 13, weight: .bold)).padding(13).studioSurface()
            field("Party venue", text: $venueName, icon: "mappin.and.ellipse", prompt: "Venue or secret location")
            VStack(alignment: .leading, spacing: 7) {
                Text("RUN OF SHOW").studioLabel()
                ForEach(Array(template.itinerary.enumerated()), id: \.offset) { index, item in
                    HStack { Text("\(index + 1)").font(.system(size: 10, weight: .black)).foregroundColor(.black).frame(width: 23, height: 23).background(NativeTheme.cyan).clipShape(Circle()); Text(item).font(.system(size: 12.5, weight: .bold)); Spacer(); Text(index == 0 ? "Doors" : "+\(index * 60)m").font(.system(size: 10, weight: .bold)).foregroundColor(.white.opacity(0.4)) }
                }
            }.padding(14).studioSurface()
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
                templatePicker("LOCATION RELEASE", selection: $popUpLocationDisclosure, options: NativePopUpLocationDisclosure.allCases)
                Text(popUpLocationDisclosure == .afterApproval ? "The public Party Pass will hide the venue. Guest-specific reveal requires a later authorized pass action." : "The venue is visible on the public Party Pass.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            }.padding(14).studioSurface()
            .onChange(of: popUpLocationDisclosure) { disclosure in
                if disclosure == .afterApproval { accessMode = .privateApproval }
            }
        case .privateParty:
            VStack(alignment: .leading, spacing: 7) {
                templatePicker("GUEST LIST", selection: $privateGuestPolicy, options: NativePrivatePartyGuestPolicy.allCases)
                Text("Private Parties always use host approval. Named guest enforcement is introduced with the authorized guest action.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.50))
            }.padding(14).studioSurface()
        case .comedyNight, .premiere:
            EmptyView()
        }
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

    private var creatorLinksEditor: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("CREATOR LINKS").studioLabel()
                    Text("Music, merch, and fan destinations").font(.system(size: 14, weight: .black))
                }
                Spacer()
                Text("\(creatorLinks.count)/8").font(.system(size: 10, weight: .black)).foregroundColor(NativeTheme.cyan)
            }
            Picker("Link type", selection: $creatorLinkKind) {
                ForEach(NativePartyCreatorLinkKind.allCases) { kind in Text(kind.title).tag(kind) }
            }.pickerStyle(.menu)
            field("Link title", text: $creatorLinkTitle, icon: creatorLinkKind.icon, prompt: "Listen now, shop merch…")
            field("Secure link", text: $creatorLinkURL, icon: "link", prompt: "https://…", keyboard: .URL)
            Button(action: addCreatorLink) {
                Label("Add creator link", systemImage: "plus.circle.fill").font(.system(size: 12.5, weight: .black)).frame(maxWidth: .infinity).frame(height: 42).foregroundColor(.black).background(creatorLinks.count < 8 ? NativeTheme.cyan : Color.white.opacity(0.16)).clipShape(RoundedRectangle(cornerRadius: 14))
            }.buttonStyle(.plain).disabled(creatorLinks.count >= 8)
            if !creatorLinks.isEmpty {
                ForEach(creatorLinks) { link in
                    HStack(spacing: 10) {
                        Image(systemName: link.kind.icon).foregroundColor(NativeTheme.cyan).frame(width: 19)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(link.title).font(.system(size: 12.5, weight: .black)).lineLimit(1)
                            Text(link.url.host ?? link.url.absoluteString).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.48)).lineLimit(1)
                        }
                        Spacer()
                        Button(action: { creatorLinks.removeAll { $0.id == link.id } }) { Image(systemName: "xmark.circle.fill").foregroundColor(.white.opacity(0.65)) }.buttonStyle(.plain).accessibilityLabel("Remove \(link.title)")
                    }.padding(10).background(Color.white.opacity(0.045)).clipShape(RoundedRectangle(cornerRadius: 13))
                }
            }
            Text("Only HTTPS links are published to your Party Pass.").font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.48))
        }.padding(14).studioSurface()
    }

    private func addCreatorLink() {
        let title = creatorLinkTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let rawURL = creatorLinkURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: rawURL) else { message = "Add a secure HTTPS creator link."; return }
        let link = NativePartyCreatorLink(kind: creatorLinkKind, title: title, url: url)
        guard link.isValid else { message = "Creator links need a title and secure HTTPS URL."; return }
        guard !creatorLinks.contains(where: { NativePartyCreatorLink.canonicalURL($0.url) == NativePartyCreatorLink.canonicalURL(link.url) }) else { message = "That creator link is already added."; return }
        creatorLinks.append(link)
        creatorLinkTitle = ""
        creatorLinkURL = ""
        message = ""
    }

    private var doorContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeading("SET THE DOOR", "Who gets in?", "Choose open entry, RSVP, cash at the door, online tickets, or host approval.")
            ForEach(templateConfiguration.allowedAccessModes) { mode in
                Button(action: { accessMode = mode }) {
                    HStack(spacing: 12) { Image(systemName: accessIcon(mode)).foregroundColor(NativeTheme.pink); VStack(alignment: .leading) { Text(mode.title).font(.system(size: 14, weight: .black)); Text(accessDetail(mode)).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.5)) }; Spacer(); Image(systemName: accessMode == mode ? "checkmark.circle.fill" : "circle").foregroundColor(accessMode == mode ? NativeTheme.emerald : .white.opacity(0.25)) }.padding(14).studioSurface(selected: accessMode == mode)
                }.buttonStyle(.plain)
            }
            if accessMode.requiresPrice { field(accessMode == .cashAtDoor ? "Cash due at door" : "Online ticket price", text: $admissionPrice, icon: "dollarsign.circle.fill", prompt: "25", keyboard: .decimalPad) }
            field("Capacity", text: $capacity, icon: "person.3.fill", prompt: "80", keyboard: .numberPad)
            VStack(alignment: .leading, spacing: 9) {
                Text("MINIMUM MEMBERSHIP").studioLabel()
                HStack(spacing: 7) {
                    ForEach([BytspotTier.green, .platinum, .black], id: \.rawValue) { tier in
                        Button(tier.displayName) { requiredTier = tier }.font(.system(size: 11, weight: .black)).foregroundColor(requiredTier == tier ? .black : .white.opacity(0.62)).frame(maxWidth: .infinity).frame(height: 38).background(requiredTier == tier ? BytspotTheme.accent(for: tier) : Color.white.opacity(0.06)).clipShape(RoundedRectangle(cornerRadius: 12))
                    }
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

    private func selectTemplate(_ id: NativePartyTemplateID) {
        templateID = id
        if id == .privateParty { accessMode = .privateApproval }
    }

    private var navigationButtons: some View {
        HStack(spacing: 10) {
            if step != .spark { Button("Back") { step = Step(rawValue: step.rawValue - 1) ?? .spark; message = "" }.studioSecondaryButton() }
            Button(action: advance) { HStack { if isPublishing { ProgressView().tint(.black) }; Text(primaryTitle); if !isPublishing { Image(systemName: "sparkles") } }.font(.system(size: 14, weight: .black)).frame(maxWidth: .infinity).frame(height: 52).foregroundColor(.black).background(Color.white).clipShape(RoundedRectangle(cornerRadius: 17)) }.buttonStyle(.plain).disabled(isPublishing)
        }
    }

    private var primaryTitle: String { isPublishing ? "Dropping…" : step == .spark ? "Build this vibe" : step == .build ? "Set the door" : step == .door ? "Invite your people" : "Drop the Moment" }

    private func advance() {
        message = ""
        if step == .build && (title.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || venueName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) { message = "Add a title and venue before setting the door."; return }
        if step == .door && draft.validationMessage != nil { message = draft.validationMessage ?? "Review the door settings."; return }
        guard step == .invite else { step = Step(rawValue: step.rawValue + 1) ?? .invite; return }
        guard !isPublishing else { return }
        isPublishing = true
        publishTask = Task { await publish() }
    }

    @MainActor private func publish() async {
        guard sessionStore.isAuthenticated, sessionStore.canAttachBearerToken, let publishingToken = sessionStore.token else { isPublishing = false; message = "Sign in before publishing this moment."; return }
        defer { isPublishing = false; publishTask = nil }
        do {
            let api = NativePartyStudioAPI(client: BytspotAPIClient(tokenProvider: { publishingToken }))
            let partyID = try await api.createDraft(draft, idempotencyKey: idempotencyKey)
            try Task.checkCancellation()
            guard sessionStore.token == publishingToken else { throw NativePartyStudioError.sessionChanged }
            message = "Preparing Party media…"
            try await api.resetMedia(partyID: partyID)
            if let coverMedia {
                message = "Uploading cover poster…"
                _ = try await api.uploadMedia(partyID: partyID, kind: .cover, dataURI: coverMedia.dataURI)
            }
            for (index, media) in albumMedia.enumerated() {
                message = "Uploading album photo \(index + 1) of \(albumMedia.count)…"
                _ = try await api.uploadMedia(partyID: partyID, kind: .album, index: index, dataURI: media.dataURI)
            }
            try Task.checkCancellation()
            guard sessionStore.token == publishingToken else { throw NativePartyStudioError.sessionChanged }
            let result = try await api.publish(partyID: partyID, draft: draft, idempotencyKey: idempotencyKey)
            try Task.checkCancellation()
            guard sessionStore.token == publishingToken else { throw NativePartyStudioError.sessionChanged }
            publishedParty = result
        }
        catch is CancellationError { if message.isEmpty { message = NativePartyStudioError.sessionChanged.localizedDescription } }
        catch { message = (error as? LocalizedError)?.errorDescription ?? "The party could not be published." }
    }

    private var draft: NativePartyDraftInput {
        let count = Int(capacity) ?? 0
        let cents = max(0, Int(((Double(admissionPrice) ?? 0) * 100).rounded()))
        let teammate = teammateEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return NativePartyDraftInput(templateID: templateID, title: title.trimmingCharacters(in: .whitespacesAndNewlines), tagline: tagline.trimmingCharacters(in: .whitespacesAndNewlines), startsAt: startsAt, venueName: venueName.trimmingCharacters(in: .whitespacesAndNewlines), capacity: count, accessMode: accessMode, cashDoorPriceCents: accessMode == .cashAtDoor ? cents : nil, requiredMembershipTier: requiredTier, audienceCircleIDs: Array(selectedCircleIDs).sorted(), itinerary: template.itinerary.enumerated().map { NativePartyItineraryItem(title: $0.element, offsetMinutes: $0.offset * 60) }, creatorLinks: creatorLinks, ticketTiers: accessMode == .paidTicket ? [NativePartyTicketTier(name: "First Drop", priceCents: cents, quantity: count, requiredMembershipTier: requiredTier)] : [], cohosts: teammate.isEmpty ? [] : [NativePartyHostAssignment(email: teammate, role: teammateRole)], templateConfiguration: templateConfiguration)
    }

    private var templateConfiguration: NativePartyTemplateConfiguration {
        switch templateID {
        case .listeningParty: return .listeningParty(listeningFormat)
        case .fanMeetup: return .fanMeetup(fanMeetupFormat)
        case .releaseParty: return .releaseParty(releaseFormat, releaseTitle)
        case .popUp: return .popUp(popUpLocationDisclosure)
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
                    HStack { Text("\(party.draft.requiredMembershipTier.displayName.uppercased()) PARTY PASS").font(.system(size: 10, weight: .black)).foregroundColor(BytspotTheme.accent(for: party.draft.requiredMembershipTier)); Spacer(); Text(template.emoji).font(.system(size: 26)) }
                    Text(party.draft.title).font(.system(size: 25, weight: .black, design: .rounded))
                    Text("\(party.draft.startsAt.formatted(date: .abbreviated, time: .shortened)) · \(party.draft.venueName)").font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.52))
                    VStack(spacing: 5) { Text("PASS CODE").font(.system(size: 9, weight: .black)).tracking(1.6).foregroundColor(.white.opacity(0.4)); Text(party.passCode).font(.system(size: 25, weight: .black, design: .monospaced)).tracking(4) }.frame(maxWidth: .infinity).padding(17).overlay(RoundedRectangle(cornerRadius: 18).stroke(style: StrokeStyle(lineWidth: 1, dash: [5])).foregroundColor(.white.opacity(0.22)))
                }.padding(20).background(Color.white.opacity(0.07)).overlay(RoundedRectangle(cornerRadius: 25).stroke(Color.white.opacity(0.12))).clipShape(RoundedRectangle(cornerRadius: 25)).accessibilityIdentifier("native-party-pass")
                Button(action: { UIPasteboard.general.string = party.shareURL.absoluteString; message = "Party link copied." }) { Label("Copy Party Link", systemImage: "doc.on.doc.fill").font(.system(size: 14, weight: .black)).frame(maxWidth: .infinity).frame(height: 52).foregroundColor(.white).background(NativeTheme.purple).clipShape(RoundedRectangle(cornerRadius: 17)) }.buttonStyle(.plain)
                if !message.isEmpty { Text(message).font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.emerald) }
            }.padding(20).padding(.top, 18)
        }
    }

    private func sectionHeading(_ eyebrow: String, _ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(eyebrow).font(.system(size: 10, weight: .black)).tracking(1.5).foregroundColor(NativeTheme.pink); Text(title).font(.system(size: 25, weight: .black, design: .rounded)); Text(subtitle).font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.48)) }
    }

    private func field(_ label: String, text: Binding<String>, icon: String, prompt: String, keyboard: UIKeyboardType = .default) -> some View {
        HStack(spacing: 10) { Image(systemName: icon).foregroundColor(NativeTheme.cyan).frame(width: 20); TextField(prompt, text: text).keyboardType(keyboard).textInputAutocapitalization(keyboard == .emailAddress ? .never : .sentences).autocorrectionDisabled(keyboard == .emailAddress).accessibilityLabel(label) }.font(.system(size: 13.5, weight: .semibold)).padding(13).studioSurface()
    }

    private func accessIcon(_ mode: NativePartyAccessMode) -> String {
        switch mode {
        case .openEntry: return "door.left.hand.open"
        case .freeRSVP: return "person.badge.plus"
        case .cashAtDoor: return "banknote.fill"
        case .paidTicket: return "ticket.fill"
        case .privateApproval: return "lock.fill"
        }
    }

    private func accessDetail(_ mode: NativePartyAccessMode) -> String {
        switch mode {
        case .openEntry: return "No RSVP, sign-in, or payment required."
        case .freeRSVP: return "Guests sign in only to reserve a free spot."
        case .cashAtDoor: return "Reserve first; collect cash at check-in."
        case .paidTicket: return "Sell a limited online ticket through secure checkout."
        case .privateApproval: return "You approve every guest."
        }
    }
    private var roleSummary: String { teammateRole == .cohost ? "Edit, invite, and check-in access." : teammateRole == .door ? "Check-in access only." : "Refund and payout access only." }

    private func setCoverImage(_ image: UIImage?) {
        guard let image, let media = NativePartyPendingImage(image: image) else { if image != nil { message = "That cover could not be prepared." }; return }
        coverMedia = media
    }

    private func addAlbumImages(_ images: [UIImage]) {
        let candidates = Array(images.prefix(6 - albumMedia.count))
        let prepared = candidates.compactMap(NativePartyPendingImage.init(image:))
        albumMedia.append(contentsOf: prepared)
        if prepared.count != candidates.count { message = "Some photos could not be prepared." }
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
    func studioSurface(selected: Bool = false) -> some View { background(selected ? NativeTheme.pink.opacity(0.13) : Color.white.opacity(0.055)).overlay(RoundedRectangle(cornerRadius: 17).stroke(selected ? NativeTheme.pink.opacity(0.72) : Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 17)) }
    func studioSecondaryButton() -> some View { font(.system(size: 13, weight: .black)).foregroundColor(.white).padding(.horizontal, 19).frame(height: 52).background(Color.white.opacity(0.07)).clipShape(RoundedRectangle(cornerRadius: 17)) }
}