import Foundation

struct ClipPatchContext: Equatable {
    let patchId: String
    let title: String
    let subtitle: String
    let status: String
    let venueId: String?
    let serviceId: String?
}

struct ClipLocalService: Identifiable, Equatable {
    let id: String
    let title: String
    let subtitle: String
    let action: String
    let iconName: String
    let tintName: String
    let priceLabel: String?
    let amountCents: Int?
    let currency: String
    let source: String

    static let fallbacks: [ClipLocalService] = [
    ClipLocalService(id: "verified-entry", title: "Verified Entry", subtitle: "Skip the line with a secure patch check.", action: "Get Verified Entry", iconName: "shield.checkered", tintName: "emerald", priceLabel: "$25 secure", amountCents: 2500, currency: "USD", source: "curated"),
    ClipLocalService(id: "vip-access", title: "VIP Access", subtitle: "Premium seating and priority arrival support.", action: "Request VIP Access", iconName: "crown.fill", tintName: "gold", priceLabel: "$75 secure", amountCents: 7500, currency: "USD", source: "curated"),
    ClipLocalService(id: "smart-parking", title: "Smart Parking", subtitle: "Find nearby parking and arrival support.", action: "Find Parking", iconName: "parkingsign.circle.fill", tintName: "cyan", priceLabel: "$15 secure", amountCents: 1500, currency: "USD", source: "curated"),
    ClipLocalService(id: "concierge-help", title: "Concierge Help", subtitle: "Local help, ride support, wellness, and guest requests.", action: "Message Concierge", iconName: "sparkles", tintName: "violet", priceLabel: "$50 secure", amountCents: 5000, currency: "USD", source: "curated")
    ]
}

struct ClipPaymentSecureResult: Equatable {
    let bookingId: String?
    let status: String
    let message: String
}

/// Thin REST client for the Clip target. Mirrors the App's tRPC shape but
/// speaks plain JSON over the HTTP adapter so the Clip stays lightweight.
struct ClipPatchVerifier {
    enum VerifyError: Error {
        case missingToken
        case network(String)
        case server(String)
        case decode
    }

    struct VerifiedPatch: Decodable {
        let id: String
        let label: String?
        let status: String
        let bindingType: String?
        let bindingId: String?
    }

    struct VerifiedBinding: Decodable {
        let type: String
        let id: String
    }

    struct VerifyResult: Decodable {
        let verified: Bool
        let patch: VerifiedPatch
        let binding: VerifiedBinding?
    }

    static let baseURL: URL = {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "BytspotAPIBaseURL") as? String,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "https://bytspot-api.onrender.com")!
    }()

    func resolvePatch(patchId: String) async throws -> ClipPatchContext {
        let payload = try await getTRPC("patch.resolve", input: ["patchId": patchId])
        guard let root = payload as? [String: Any] else { throw VerifyError.decode }
        let patch = root["patch"] as? [String: Any]
        let vendor = root["vendor"] as? [String: Any]
        let service = root["service"] as? [String: Any]

        let resolvedId = string(patch?["id"]) ?? string(patch?["uid"]) ?? patchId
        let vendorName = string(vendor?["displayName"]) ?? string(vendor?["name"])
        let serviceName = string(service?["title"]) ?? string(service?["name"])
        let label = string(patch?["label"]) ?? string(patch?["name"])
        let title = vendorName ?? label ?? "Bytspot Patch"
        let subtitle = serviceName ?? string(root["type"])?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Secure local access"
        return ClipPatchContext(
            patchId: resolvedId,
            title: title,
            subtitle: subtitle,
            status: string(patch?["status"]) ?? "active",
            venueId: string(vendor?["id"]) ?? string(root["venueId"]),
            serviceId: string(service?["id"])
        )
    }

    func searchServices(patchId: String, limit: Int = 24) async throws -> [ClipLocalService] {
        let payload = try await getTRPC("vendors.search", input: ["patchId": patchId, "limit": limit])
        guard let root = payload as? [String: Any] else { return [] }
        let rows = (root["services"] as? [[String: Any]]) ?? (root["vendors"] as? [[String: Any]]) ?? []
        let mapped = rows.prefix(8).enumerated().map { index, row in
            normalizeService(row, index: index)
        }
        return mapped.filter { !$0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    func verify(token: String?) async throws -> VerifyResult {
        guard let token, !token.isEmpty else { throw VerifyError.missingToken }

        var req = URLRequest(url: Self.baseURL.appendingPathComponent("trpc/patch.verifyTap"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.timeoutInterval = 8
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "token": token
        ])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw VerifyError.network("No response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                .flatMap { ($0["error"] as? [String: Any])?["message"] as? String }
                ?? "HTTP \(http.statusCode)"
            throw VerifyError.server(msg)
        }

        // tRPC HTTP adapter wraps mutation results as { result: { data: ... } }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = root["result"] as? [String: Any],
              let payload = result["data"] else {
            throw VerifyError.decode
        }
        let payloadData = try JSONSerialization.data(withJSONObject: payload)
        do {
            return try JSONDecoder().decode(VerifyResult.self, from: payloadData)
        } catch {
            throw VerifyError.decode
        }
    }

    func authorizeApplePaySecure(
        service: ClipLocalService,
        patchId: String?,
        stripePaymentMethodId: String,
        amountCents: Int,
        guestContact: [String: String]? = nil
    ) async throws -> ClipPaymentSecureResult {
        var input: [String: Any] = [
            "serviceId": service.id,
            "patchId": patchId ?? NSNull(),
            "amountCents": amountCents,
            "currency": service.currency.lowercased(),
            "stripePaymentMethodId": stripePaymentMethodId,
            "captureMode": "manual",
            "source": "app_clip.apple_pay_secure"
        ]
        if let guestContact, !guestContact.isEmpty {
            input["guestContact"] = guestContact
        }
        let payload = try await postTRPC("booking.authorizeApplePayHold", input: input)
        let root = payload as? [String: Any]
        return ClipPaymentSecureResult(
            bookingId: Self.string(root?["bookingId"]),
            status: Self.string(root?["status"]) ?? "authorized",
            message: Self.string(root?["message"]) ?? "Apple Pay Secure authorized."
        )
    }

    private func getTRPC(_ procedure: String, input: [String: Any]) async throws -> Any {
        var components = URLComponents(url: Self.baseURL.appendingPathComponent("trpc/\(procedure)"), resolvingAgainstBaseURL: false)
        let inputData = try JSONSerialization.data(withJSONObject: input)
        components?.queryItems = [URLQueryItem(name: "input", value: String(data: inputData, encoding: .utf8))]
        guard let url = components?.url else { throw VerifyError.network("Bad URL") }

        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 8
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw VerifyError.network("No response") }
        guard (200..<300).contains(http.statusCode) else { throw VerifyError.server("HTTP \(http.statusCode)") }
        return try unwrapTRPCPayload(data)
    }

    private func postTRPC(_ procedure: String, input: [String: Any]) async throws -> Any {
        var req = URLRequest(url: Self.baseURL.appendingPathComponent("trpc/\(procedure)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = Self.authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        req.timeoutInterval = 10
        req.httpBody = try JSONSerialization.data(withJSONObject: input)

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw VerifyError.network("No response") }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])
                .flatMap { ($0["error"] as? [String: Any])?["message"] as? String }
                ?? "HTTP \(http.statusCode)"
            throw VerifyError.server(msg)
        }
        return try unwrapTRPCPayload(data)
    }

    private func unwrapTRPCPayload(_ data: Data) throws -> Any {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw VerifyError.decode }
        if let error = root["error"] as? [String: Any] {
            throw VerifyError.server(Self.string(error["message"]) ?? "Server error")
        }
        if let result = root["result"] as? [String: Any], let payload = result["data"] {
            return payload
        }
        return root
    }

    private func normalizeService(_ row: [String: Any], index: Int) -> ClipLocalService {
        let vendor = row["vendor"] as? [String: Any]
        let rawCategory = Self.string(row["category"]) ?? Self.string(row["serviceCategory"]) ?? Self.string(vendor?["category"])
        let title = Self.string(row["title"]) ?? Self.string(row["name"]) ?? Self.string(vendor?["displayName"]) ?? "Local Service"
        let desc = Self.string(row["description"]) ?? Self.string(row["serviceSubtitle"]) ?? rawCategory ?? "Available near this verified patch."
        let action = Self.string(row["ctaText"]) ?? Self.string(row["action"]) ?? "Book Apple Pay Secure"
        let rawAmount = Self.int(row["priceCents"]) ?? Self.int(row["amountCents"])
        let currency = Self.string(row["currency"])?.uppercased() ?? "USD"
        let price = Self.string(row["entryPrice"]) ?? Self.string(row["price"]) ?? rawAmount.map { Self.formatCurrency(cents: $0, currency: currency) }
        let category = (rawCategory ?? title).lowercased()
        let icon: String
        let tint: String
        if category.contains("park") || category.contains("car") {
            icon = "car.side.lock.fill"; tint = "cyan"
        } else if category.contains("vip") || category.contains("access") || category.contains("entry") {
            icon = "crown.fill"; tint = "gold"
        } else if category.contains("pay") || category.contains("book") {
            icon = "creditcard.and.123"; tint = "emerald"
        } else if category.contains("concierge") || category.contains("help") {
            icon = "sparkles"; tint = "violet"
        } else {
            icon = "checkmark.seal.fill"; tint = "emerald"
        }
        return ClipLocalService(
            id: Self.string(row["id"]) ?? Self.string(row["vendorServiceId"]) ?? "service-\(index)",
            title: title,
            subtitle: desc,
            action: action,
            iconName: icon,
            tintName: tint,
            priceLabel: price,
            amountCents: rawAmount,
            currency: currency,
            source: "live"
        )
    }

    private static func string(_ value: Any?) -> String? {
        guard let value else { return nil }
        if let value = value as? String, !value.isEmpty { return value }
        if let value = value as? NSNumber { return value.stringValue }
        return nil
    }

    private static func int(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) }
        return nil
    }

    private static func formatCurrency(cents: Int, currency: String) -> String {
        let dollars = Double(cents) / 100.0
        if currency.uppercased() == "USD" {
            return String(format: "$%.0f secure", dollars)
        }
        return "\(currency.uppercased()) \(String(format: "%.2f", dollars)) secure"
    }

    private func string(_ value: Any?) -> String? { Self.string(value) }

    private static var authToken: String? {
        let defaults = UserDefaults.standard
        let candidates = [
            defaults.string(forKey: "bytspot_auth_token"),
            defaults.string(forKey: "BytspotAuthToken")
        ]
        return candidates
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty && $0 != "guest_session" && $0 != "beta_guest" }
    }
}
