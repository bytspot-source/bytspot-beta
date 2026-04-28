import Foundation

/// Thin REST client for the Clip target. Mirrors the App's tRPC shape for
/// `patch.verifyTap` but speaks plain JSON over the tRPC HTTP adapter so the
/// Clip stays under the 10 MB budget without bundling the full tRPC client.
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
}
