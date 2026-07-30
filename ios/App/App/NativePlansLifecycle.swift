import Foundation
import SwiftUI

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
    static let schemaVersion = 1
    var id: String { eventID }
    let version: Int
    let eventID: String
    var viewerRole: NativePlanViewerRole
    var rsvpChoice: NativePlanRSVPChoice
    var rsvpSync: NativePlanSyncState
    var publication: NativePlanPublicationState
    var collaborators: [NativePlanCollaborator]
    var updatedAt: Date
}

enum NativePlanMarketPolicy {
    static let remoteRSVPAvailable = false
    static let coHostManagementAvailable = false

    static func canManageGuests(_ lifecycle: NativePlanLifecycleRecord?) -> Bool {
        lifecycle?.viewerRole == .owner && lifecycle?.publication == .published
    }

    static func canManageAsCoHost(_ collaborator: NativePlanCollaborator) -> Bool {
        coHostManagementAvailable && collaborator.authority == .serverVerified
    }

    static func liveCircles(from snapshot: NativeSocialCircleSnapshot) -> [NativeSocialCircle] {
        snapshot.source == .backend ? snapshot.groups : []
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

    @discardableResult func setRSVP(_ choice: NativePlanRSVPChoice, for eventID: String) -> Bool {
        guard var record = records[eventID] else { return false }
        record.rsvpChoice = choice
        record.rsvpSync = NativePlanMarketPolicy.remoteRSVPAvailable ? .syncing : .localOnly
        record.updatedAt = clock()
        records[eventID] = record
        return persist()
    }

    @discardableResult func setPublication(_ state: NativePlanPublicationState, for eventID: String) -> Bool {
        guard var record = records[eventID] else { return false }
        record.publication = state
        record.updatedAt = clock()
        records[eventID] = record
        return persist()
    }

    private func load() {
        guard let data = defaults.data(forKey: Self.storageKey), let decoded = try? JSONDecoder().decode([NativePlanLifecycleRecord].self, from: data) else { return }
        records = Dictionary(uniqueKeysWithValues: decoded.map { ($0.eventID, $0) })
    }

    @discardableResult private func persist() -> Bool {
        let payload = records.values.sorted { $0.eventID < $1.eventID }
        guard let data = try? JSONEncoder().encode(payload) else { return false }
        defaults.set(data, forKey: Self.storageKey)
        return true
    }
}
