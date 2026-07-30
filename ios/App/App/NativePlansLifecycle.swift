import Foundation
import SwiftUI
import CryptoKit

struct NativePlanAccountScope: Codable, Equatable {
    let identifier: String

    static func authenticated(token: String?) -> NativePlanAccountScope? {
        guard let token, !token.isEmpty, token != "guest_session" else { return nil }
        let identifier = SHA256.hash(data: Data(token.utf8)).map { String(format: "%02x", $0) }.joined()
        return NativePlanAccountScope(identifier: identifier)
    }
}

enum NativePlanRSVPChoice: String, Codable, CaseIterable, Identifiable {
    case none, going, maybe, notGoing
    var id: String { rawValue }
    var title: String {
        switch self {
        case .none: return "Respond"
        case .going: return "Going"
        case .maybe: return "Maybe"
        case .notGoing: return "Not going"
        }
    }
    var icon: String {
        switch self {
        case .none: return "circle"
        case .going: return "checkmark.circle.fill"
        case .maybe: return "questionmark.circle.fill"
        case .notGoing: return "xmark.circle.fill"
        }
    }
}

enum NativePlanSyncState: String, Codable {
    case localOnly, syncing, synced, failed, unsupported
}

enum NativePlanPublicationState: String, Codable {
    case localDraft, publishing, published, failed
}

enum NativePlanViewerRole: String, Codable {
    case owner, attendee, savedInvite
}

enum NativePlanCollaboratorAuthority: String, Codable {
    case presentationOnly, serverVerified
}

struct NativePlanCollaborator: Codable, Equatable, Identifiable {
    let id: String
    var displayName: String
    var role: String
    var authority: NativePlanCollaboratorAuthority

    static func presentationOnly(name: String, index: Int) -> NativePlanCollaborator {
        let normalized = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return NativePlanCollaborator(id: "cohost-\(index)-\(normalized)", displayName: name, role: "Co-host", authority: .presentationOnly)
    }
}

struct NativePlanLifecycleRecord: Codable, Equatable, Identifiable {
    static let schemaVersion = 2
    var id: String { eventID }
    let version: Int
    let eventID: String
    var viewerRole: NativePlanViewerRole
    var rsvpChoice: NativePlanRSVPChoice
    var rsvpSync: NativePlanSyncState
    var publication: NativePlanPublicationState
    var collaborators: [NativePlanCollaborator]
    var updatedAt: Date
    var ownerAccountID: String? = nil
    var publicationAccountID: String? = nil
}

enum NativePlanMarketPolicy {
    static let remoteRSVPAvailable = false
    static let coHostManagementAvailable = false

    static func canPresentHostTools(_ lifecycle: NativePlanLifecycleRecord?, accountScope: NativePlanAccountScope?) -> Bool {
        guard lifecycle?.viewerRole == .owner else { return false }
        guard let ownerAccountID = lifecycle?.ownerAccountID else { return true }
        return ownerAccountID == accountScope?.identifier
    }

    static func canPublish(_ lifecycle: NativePlanLifecycleRecord?, accountScope: NativePlanAccountScope?) -> Bool {
        guard let accountScope, canPresentHostTools(lifecycle, accountScope: accountScope) else { return false }
        return lifecycle?.ownerAccountID == nil || lifecycle?.ownerAccountID == accountScope.identifier
    }

    static func isPublished(_ lifecycle: NativePlanLifecycleRecord?, accountScope: NativePlanAccountScope?) -> Bool {
        guard let accountScope else { return false }
        return lifecycle?.viewerRole == .owner
            && lifecycle?.publication == .published
            && lifecycle?.ownerAccountID == accountScope.identifier
            && lifecycle?.publicationAccountID == accountScope.identifier
    }

    static func canManageGuests(_ lifecycle: NativePlanLifecycleRecord?, accountScope: NativePlanAccountScope?) -> Bool {
        isPublished(lifecycle, accountScope: accountScope)
    }

    static func canManageAsCoHost(_ collaborator: NativePlanCollaborator) -> Bool {
        coHostManagementAvailable && collaborator.authority == .serverVerified
    }

    static func liveCircles(from snapshot: NativeSocialCircleSnapshot) -> [NativeSocialCircle] {
        snapshot.source == .backend ? snapshot.groups : []
    }

    static func rsvpSummary(_ lifecycle: NativePlanLifecycleRecord?) -> String {
        guard let lifecycle, lifecycle.rsvpChoice != .none else { return "Respond" }
        switch lifecycle.rsvpSync {
        case .synced: return lifecycle.rsvpChoice.title
        case .syncing: return "\(lifecycle.rsvpChoice.title) · syncing"
        default: return "\(lifecycle.rsvpChoice.title) · on this iPhone"
        }
    }
}

@MainActor final class NativePlanStore: ObservableObject {
    static let storageKey = "bytspot_native_plan_lifecycle_v1"
    @Published private(set) var records: [String: NativePlanLifecycleRecord] = [:]
    private let defaults: UserDefaults
    private let clock: () -> Date

    init(defaults: UserDefaults = .standard, clock: @escaping () -> Date = Date.init) {
        self.defaults = defaults
        self.clock = clock
        load()
    }

    func refresh(events: [NativeGroupEventRecord]) {
        var changed = false
        for event in events {
            let collaborators = event.coHosts.enumerated().map { NativePlanCollaborator.presentationOnly(name: $0.element, index: $0.offset) }
            let role: NativePlanViewerRole = event.privateAssociation == .host ? .owner : (event.privateAssociation == .joinedViaInvite ? .attendee : .savedInvite)
            if var current = records[event.id] {
                if current.collaborators != collaborators || current.viewerRole != role {
                    current.collaborators = collaborators
                    current.viewerRole = role
                    if role != .owner {
                        current.publication = .localDraft
                        current.ownerAccountID = nil
                        current.publicationAccountID = nil
                    }
                    current.updatedAt = clock()
                    records[event.id] = current
                    changed = true
                }
            } else {
                records[event.id] = NativePlanLifecycleRecord(version: NativePlanLifecycleRecord.schemaVersion, eventID: event.id, viewerRole: role, rsvpChoice: .none, rsvpSync: .localOnly, publication: .localDraft, collaborators: collaborators, updatedAt: clock())
                changed = true
            }
        }
        if changed { persist() }
    }

    func lifecycle(for eventID: String) -> NativePlanLifecycleRecord? { records[eventID] }

    @discardableResult func bindOwner(for eventID: String, accountScope: NativePlanAccountScope) -> Bool {
        guard var record = records[eventID], record.viewerRole == .owner else { return false }
        guard record.ownerAccountID == nil || record.ownerAccountID == accountScope.identifier else { return false }
        record.ownerAccountID = accountScope.identifier
        record.updatedAt = clock()
        records[eventID] = record
        return persist()
    }

    @discardableResult func setRSVP(_ choice: NativePlanRSVPChoice, for eventID: String) -> Bool {
        guard var record = records[eventID] else { return false }
        record.rsvpChoice = choice
        record.rsvpSync = NativePlanMarketPolicy.remoteRSVPAvailable ? .syncing : .localOnly
        record.updatedAt = clock()
        records[eventID] = record
        return persist()
    }

    @discardableResult func setPublication(_ state: NativePlanPublicationState, for eventID: String, accountScope: NativePlanAccountScope? = nil) -> Bool {
        guard var record = records[eventID] else { return false }
        if state == .publishing || state == .published {
            guard let accountScope, NativePlanMarketPolicy.canPublish(record, accountScope: accountScope) else { return false }
            record.ownerAccountID = accountScope.identifier
            record.publicationAccountID = accountScope.identifier
        } else {
            record.publicationAccountID = nil
        }
        record.publication = state
        record.updatedAt = clock()
        records[eventID] = record
        return persist()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.storageKey), let decoded = try? JSONDecoder().decode([NativePlanLifecycleRecord].self, from: data) else { return }
        records = decoded.reduce(into: [:]) { result, record in
            if let existing = result[record.eventID], existing.updatedAt >= record.updatedAt { return }
            result[record.eventID] = record
        }
    }

    @discardableResult private func persist() -> Bool {
        let payload = records.values.sorted { $0.eventID < $1.eventID }
        guard let data = try? JSONEncoder().encode(payload) else { return false }
        defaults.set(data, forKey: Self.storageKey)
        return true
    }
}
