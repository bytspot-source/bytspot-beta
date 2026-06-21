import Foundation
import CryptoKit

/// Client-side contact hashing for the privacy-first contact graph
/// (WS-Social Phase 1). Raw contacts never leave the device — only a salted
/// SHA-256 of the normalized email/phone is sent to `social.syncCloudContact`.
///
/// IMPORTANT: the normalization rules below are the shared contract with the
/// server (`src/lib/contactHash.ts`). Any change here MUST be mirrored there or
/// Apple-sourced hashes will stop matching server-stored hashes.
enum BytspotContactHasher {
    /// Build-time override key (Info.plist) for the shared hash salt.
    static let saltInfoPlistKey = "BytspotContactHashSalt"
    /// Runtime override key (simulator/dev) for the shared hash salt.
    static let saltEnvironmentKey = "BYT_NATIVE_CONTACT_SALT"
    /// Mirrors the server's dev default (`config.contactHashSalt`) so DEBUG
    /// self-tests and a local backend match out of the box. Production builds
    /// override via the Info.plist key to match the deployed `CONTACT_HASH_SALT`.
    static let defaultSalt = "dev-contact-salt-change-me"

    /// Resolved salt: environment → Info.plist → dev default.
    static var salt: String {
        if let env = ProcessInfo.processInfo.environment[saltEnvironmentKey], !env.isEmpty { return env }
        if let plist = Bundle.main.object(forInfoDictionaryKey: saltInfoPlistKey) as? String, !plist.isEmpty { return plist }
        return defaultSalt
    }

    /// Lowercase + trim. Returns nil when the value is not a plausible email.
    static func normalizeEmail(_ raw: String?) -> String? {
        let v = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return v.count > 2 && v.contains("@") ? v : nil
    }

    /// Normalize a phone number to a digit-only string.
    /// Rules (must match the server):
    ///   - strip every non-digit character
    ///   - a bare 10-digit number is assumed NANP → prefix "1"
    ///   - everything else is kept as-is (best-effort international)
    static func normalizePhone(_ raw: String?) -> String? {
        let digits = String((raw ?? "").filter { ("0"..."9").contains($0) })
        if digits.count < 7 { return nil } // too short to be a real number
        return digits.count == 10 ? "1\(digits)" : digits
    }

    private static func sha256Hex(_ input: String) -> String {
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Salted hash of a normalized email, or nil when not hashable.
    static func hashEmail(_ raw: String?) -> String? {
        guard let v = normalizeEmail(raw) else { return nil }
        return sha256Hex("\(salt):email:\(v)")
    }

    /// Salted hash of a normalized phone, or nil when not hashable.
    static func hashPhone(_ raw: String?) -> String? {
        guard let v = normalizePhone(raw) else { return nil }
        return sha256Hex("\(salt):phone:\(v)")
    }

    /// Hash an arbitrary contact value, auto-detecting email vs phone by the
    /// presence of "@".
    static func hashContactValue(_ raw: String?) -> String? {
        guard let raw, !raw.isEmpty else { return nil }
        return raw.contains("@") ? hashEmail(raw) : hashPhone(raw)
    }
}
