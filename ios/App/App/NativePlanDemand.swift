import Foundation

/// Asking venues to fill a gap in a Plan.
///
/// A Plan already states when, where and how many, so asking takes one tap and
/// no typing. What comes back is an offer from a real business, or nothing.
///
/// Nothing here decides whether a need *can* be asked about. That judgement
/// lives on the server, which owns the vendor vocabulary, and duplicating it
/// here would drift the moment either side changed. The client asks and shows
/// the answer, including the refusal.

struct NativePlanDemandOffer: Codable, Identifiable, Equatable {
    let id: String
    /// The place, not the business: a guest recognises where they are going.
    let `where`: String
    let startsAt: String
    let durationMins: Int
    let priceCents: Int
    let terms: String?
    let holdExpiresAt: String

}

struct NativePlanDemandAsk: Codable, Identifiable, Equatable {
    let id: String
    let state: String
    let category: String
    let partySize: Int
    let planId: String?
    let expiresAt: String
    let offers: [NativePlanDemandOffer]

    /// What the guest is owed while they wait, stated without overclaiming.
    var status: String {
        if !offers.isEmpty { return offers.count == 1 ? "1 offer" : "\(offers.count) offers" }
        switch state {
        // MATCHED means a venue that could answer has seen it. It does not mean
        // anyone intends to, so it must not read as progress toward a booking.
        case "MATCHED": return "Venues can see this"
        default: return "Waiting"
        }
    }
}

/// Injectable seam, so the plan sheet's asking states are testable without a network.
protocol NativePlanDemandAsking {
    func ask(planID: String, needKind: String) async throws -> NativePlanDemandAsk
    func mine() async throws -> [NativePlanDemandAsk]
    func withdraw(demandID: String) async throws
}

struct NativePlanDemandAPI: NativePlanDemandAsking {
    let client: BytspotAPIClient

    func ask(planID: String, needKind: String) async throws -> NativePlanDemandAsk {
        let payload = try await client.trpcPayload(
            path: "/trpc/demand.fromPlan",
            method: "POST",
            input: ["planId": planID, "needKind": needKind],
        )
        // The publish reply is the demand without its offers; there cannot be
        // any yet, and inventing the field keeps one decoder for both shapes.
        let data = try JSONSerialization.data(withJSONObject: payload)
        let raised = try JSONDecoder().decode(NativePlanDemandRaised.self, from: data)
        return NativePlanDemandAsk(
            id: raised.id,
            state: raised.state,
            category: raised.category,
            partySize: 0,
            planId: planID,
            expiresAt: raised.expiresAt,
            offers: [],
        )
    }

    func mine() async throws -> [NativePlanDemandAsk] {
        let payload = try await client.trpcQueryPayload(path: "/trpc/demand.mine", input: [:])
        let data = try JSONSerialization.data(withJSONObject: payload)
        return try JSONDecoder().decode([NativePlanDemandAsk].self, from: data)
    }

    func withdraw(demandID: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/demand.withdraw", method: "POST", input: ["demandId": demandID])
    }
}

/// The narrower shape `demand.fromPlan` returns.
struct NativePlanDemandRaised: Codable, Equatable {
    let id: String
    let state: String
    let category: String
    let expiresAt: String
}

/// What the plan sheet knows about asking, kept out of the view.
struct NativePlanDemandState: Equatable {
    /// Live asks for this plan, by the need they were raised for.
    var asks: [String: NativePlanDemandAsk] = [:]
    /// The need currently being asked about, so only its row shows a spinner.
    var asking: String?
    /// Why the last ask was refused, against the need it was refused for.
    var refusal: [String: String] = [:]

    mutating func record(_ ask: NativePlanDemandAsk, for need: String) {
        asks[need] = ask
        refusal[need] = nil
        asking = nil
    }

    mutating func refuse(_ message: String, for need: String) {
        refusal[need] = message
        asking = nil
    }

    /// Demand carries its category, not the plan's word for the need, so the
    /// mapping back has to come from the needs the plan actually has.
    mutating func adopt(_ mine: [NativePlanDemandAsk], planID: String, needs: [String]) {
        var matched: [String: NativePlanDemandAsk] = [:]
        for ask in mine where ask.planId == planID {
            if let need = needs.first(where: { NativePlanDemandCategory.matches(need: $0, category: ask.category) }) {
                matched[need] = ask
            }
        }
        asks = matched
    }
}

/// The plan-need to demand-category pairs, mirrored only to read asks back.
///
/// The server decides what may be asked; this exists solely to recognise a
/// returning ask as belonging to a need. A pair missing here costs a status
/// line, never a wrong or duplicate request.
enum NativePlanDemandCategory {
    static let pairs: [String: String] = [
        "coffee": "coffee",
        "dining": "dining",
        "nightlife": "nightlife",
        "shopping": "shopping",
        "fitness": "fitness",
        "events": "entertainment",
        "stay": "boutique_apartment",
    ]

    static func matches(need: String, category: String) -> Bool {
        pairs[need] == category
    }
}

/// Turning a failed ask into something worth reading.
enum NativePlanDemandFailure {
    /// The server's refusals are written for the guest and name what to fix,
    /// so they are passed through rather than replaced by a generic failure.
    /// Anything without a message is a transport problem, and saying so is
    /// more honest than blaming the plan.
    static func message(for error: Error) -> String {
        guard case let BytspotAPIClient.APIError.server(_, body) = error else {
            return "Couldn't reach Bytspot. Try again."
        }
        let said = serverMessage(in: body)
        return said.isEmpty ? "Couldn't ask right now. Try again." : said
    }

    static func serverMessage(in body: String) -> String {
        guard let data = body.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) else { return "" }
        return firstMessage(in: root)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private static func firstMessage(in value: Any) -> String? {
        if let dictionary = value as? [String: Any] {
            if let message = dictionary["message"] as? String, !message.isEmpty { return message }
            for child in dictionary.values { if let message = firstMessage(in: child) { return message } }
        } else if let array = value as? [Any] {
            for child in array { if let message = firstMessage(in: child) { return message } }
        }
        return nil
    }
}
