import SwiftUI
import UIKit

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
    @State private var ticketPrice = "25"
    @State private var selectedCircleIDs: Set<String> = []
    @State private var teammateEmail = ""
    @State private var teammateRole: NativePartyHostRole = .cohost
    @State private var isPublishing = false
    @State private var publishedParty: NativePublishedParty?
    @State private var message = ""

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
                    Button(action: { nativeImpactLight(); templateID = item.id }) {
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

    private var doorContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeading("SET THE DOOR", "Who gets in?", "Choose RSVP, a paid first drop, or host approval.")
            ForEach(NativePartyAccessMode.allCases) { mode in
                Button(action: { accessMode = mode }) {
                    HStack(spacing: 12) { Image(systemName: mode == .paidTicket ? "ticket.fill" : mode == .privateApproval ? "lock.fill" : "person.badge.plus").foregroundColor(NativeTheme.pink); VStack(alignment: .leading) { Text(mode.title).font(.system(size: 14, weight: .black)); Text(accessDetail(mode)).font(.system(size: 10.5, weight: .semibold)).foregroundColor(.white.opacity(0.5)) }; Spacer(); Image(systemName: accessMode == mode ? "checkmark.circle.fill" : "circle").foregroundColor(accessMode == mode ? NativeTheme.emerald : .white.opacity(0.25)) }.padding(14).studioSurface(selected: accessMode == mode)
                }.buttonStyle(.plain)
            }
            if accessMode == .paidTicket { field("First Drop price", text: $ticketPrice, icon: "dollarsign.circle.fill", prompt: "25", keyboard: .decimalPad) }
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
        Task { await publish() }
    }

    @MainActor private func publish() async {
        guard sessionStore.isAuthenticated, sessionStore.canAttachBearerToken, let publishingToken = sessionStore.token else { message = "Sign in before publishing this moment."; return }
        isPublishing = true; defer { isPublishing = false }
        do {
            let result = try await NativePartyStudioAPI(client: BytspotAPIClient(tokenProvider: { publishingToken })).createAndPublish(draft)
            guard sessionStore.token == publishingToken else { message = "Your session changed. Reopen Host Studio to continue."; return }
            publishedParty = result
        }
        catch { message = (error as? LocalizedError)?.errorDescription ?? "The party could not be published." }
    }

    private var draft: NativePartyDraftInput {
        let count = Int(capacity) ?? 0
        let cents = max(0, Int(((Double(ticketPrice) ?? 0) * 100).rounded()))
        let teammate = teammateEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        return NativePartyDraftInput(templateID: templateID, title: title.trimmingCharacters(in: .whitespacesAndNewlines), tagline: tagline.trimmingCharacters(in: .whitespacesAndNewlines), startsAt: startsAt, venueName: venueName.trimmingCharacters(in: .whitespacesAndNewlines), capacity: count, accessMode: accessMode, requiredMembershipTier: requiredTier, audienceCircleIDs: Array(selectedCircleIDs).sorted(), itinerary: template.itinerary.enumerated().map { NativePartyItineraryItem(title: $0.element, offsetMinutes: $0.offset * 60) }, ticketTiers: accessMode == .paidTicket ? [NativePartyTicketTier(name: "First Drop", priceCents: cents, quantity: count, requiredMembershipTier: requiredTier)] : [], cohosts: teammate.isEmpty ? [] : [NativePartyHostAssignment(email: teammate, role: teammateRole)])
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

    private func accessDetail(_ mode: NativePartyAccessMode) -> String { mode == .freeRSVP ? "Fastest way to fill the room." : mode == .paidTicket ? "Sell a limited first drop." : "You approve every guest." }
    private var roleSummary: String { teammateRole == .cohost ? "Edit, invite, and check-in access." : teammateRole == .door ? "Check-in access only." : "Refund and payout access only." }
}

private extension Text {
    func studioLabel() -> some View { font(.system(size: 9.5, weight: .black)).tracking(1.2).foregroundColor(.white.opacity(0.45)) }
}

private extension View {
    func studioSurface(selected: Bool = false) -> some View { background(selected ? NativeTheme.pink.opacity(0.13) : Color.white.opacity(0.055)).overlay(RoundedRectangle(cornerRadius: 17).stroke(selected ? NativeTheme.pink.opacity(0.72) : Color.white.opacity(0.08))).clipShape(RoundedRectangle(cornerRadius: 17)) }
    func studioSecondaryButton() -> some View { font(.system(size: 13, weight: .black)).foregroundColor(.white).padding(.horizontal, 19).frame(height: 52).background(Color.white.opacity(0.07)).clipShape(RoundedRectangle(cornerRadius: 17)) }
}