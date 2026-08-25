import Foundation
import MetricKit

/// Crash and hang reports from real devices.
///
/// MetricKit delivers a payload on a later launch, after the process that
/// produced it is gone, so a report is only useful if it survives the gap. It
/// is queued on disk and retried, and only dropped once the server has said it
/// holds it — a crash that vanishes because the network was down is the crash
/// we most needed to see.
///
/// Nothing identifying is collected: MetricKit's own fields are forwarded and
/// nothing else, so no account, token, or location can leave through here.
final class BytspotDiagnostics: NSObject, MXMetricManagerSubscriber {
    static let shared = BytspotDiagnostics()

    private let queueKey = "bytspot.diagnostics.pending"
    private let maxQueued = 20
    private let defaults: UserDefaults
    private let endpoint: URL
    private let session: URLSession

    init(defaults: UserDefaults = .standard, baseURL: URL = BytspotAPIClient().baseURL, session: URLSession = .shared) {
        self.defaults = defaults
        self.endpoint = baseURL.appendingPathComponent("diagnostics/ios")
        self.session = session
        super.init()
    }

    func start() {
        MXMetricManager.shared.add(self)
        flush()
    }

    // MARK: - MetricKit

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            payload.crashDiagnostics?.forEach { enqueue(Self.report(crash: $0)) }
            payload.hangDiagnostics?.forEach { enqueue(Self.report(hang: $0)) }
        }
        flush()
    }

    func didReceive(_ payloads: [MXMetricPayload]) {
        // Aggregate performance metrics are read in Xcode Organizer; forwarding
        // them here would add volume without adding a signal we act on.
    }

    // MARK: - Payload shaping

    static func report(crash diagnostic: MXCrashDiagnostic) -> [String: String] {
        var report: [String: String] = ["kind": "crash"]
        if let signal = diagnostic.signal { report["signal"] = "\(signal)" }
        if let reason = diagnostic.terminationReason { report["terminationReason"] = String(reason.prefix(512)) }
        if let type = diagnostic.exceptionType { report["exceptionType"] = "\(type)" }
        report["appVersion"] = diagnostic.applicationVersion
        report["osVersion"] = diagnostic.metaData.osVersion
        report["callStackSummary"] = Self.summarize(diagnostic.callStackTree)
        report["occurredAt"] = ISO8601DateFormatter().string(from: Date())
        return report
    }

    static func report(hang diagnostic: MXHangDiagnostic) -> [String: String] {
        var report: [String: String] = ["kind": "hang"]
        report["terminationReason"] = "hang \(diagnostic.hangDuration.value)\(diagnostic.hangDuration.unit.symbol)"
        report["appVersion"] = diagnostic.applicationVersion
        report["osVersion"] = diagnostic.metaData.osVersion
        report["callStackSummary"] = Self.summarize(diagnostic.callStackTree)
        report["occurredAt"] = ISO8601DateFormatter().string(from: Date())
        return report
    }

    /// The server caps this field, so a tree that exceeds the cap would be
    /// rejected whole. Truncating here keeps the report rather than losing it.
    static func summarize(_ tree: MXCallStackTree, limit: Int = 4000) -> String {
        let raw = String(data: tree.jsonRepresentation(), encoding: .utf8) ?? ""
        return raw.count <= limit ? raw : String(raw.prefix(limit))
    }

    // MARK: - Durable queue

    private func enqueue(_ report: [String: String]) {
        var pending = queued()
        pending.append(report)
        // Oldest first out: a crash loop must not push out the report that
        // explains it, but an unbounded queue must not grow forever either.
        defaults.set(Array(pending.suffix(maxQueued)), forKey: queueKey)
    }

    func queued() -> [[String: String]] {
        defaults.array(forKey: queueKey) as? [[String: String]] ?? []
    }

    func flush() {
        let pending = queued()
        guard !pending.isEmpty else { return }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["payloads": pending])
        guard request.httpBody != nil else { return }

        session.dataTask(with: request) { [weak self] _, response, _ in
            guard let self else { return }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            // Kept on any failure and retried next launch; a rejected batch is
            // dropped because retrying it forever would never succeed.
            if (200..<300).contains(status) || status == 400 {
                self.defaults.removeObject(forKey: self.queueKey)
            }
        }.resume()
    }
}
