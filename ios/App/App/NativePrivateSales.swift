import SwiftUI
import UIKit

/// Private sales: a seller shares an item with buyers they choose, an expiring
/// meet point and their own payment handle. Bytspot shows the handle and opens
/// the provider; it never holds, moves or protects money.

enum NativeSalePaymentProvider: String, Codable, CaseIterable, Identifiable {
    case paypal, cashapp, venmo

    var id: String { rawValue }

    var title: String {
        switch self {
        case .paypal: return "PayPal"
        case .cashapp: return "Cash App"
        case .venmo: return "Venmo"
        }
    }

    var placeholder: String {
        switch self {
        case .paypal: return "paypal.me/yourname"
        case .cashapp: return "$cashtag"
        case .venmo: return "@username"
        }
    }

    /// What the seller confirms about the account, per the provider's own rules.
    var goodsAndServicesStatement: String {
        switch self {
        case .paypal: return "It accepts Goods and Services payments"
        case .cashapp: return "It's a Cash App Business account, or uses Earn in P2P"
        case .venmo: return "It's a business profile, or buyers can tag payments as a purchase"
        }
    }
}

struct NativeSaleHandle: Codable, Equatable, Identifiable {
    let provider: NativeSalePaymentProvider
    let handle: String
    let displayName: String
    let confirmedAt: String
    let url: String
    var id: String { provider.rawValue }
}

struct NativeSaleHandleList: Codable { let handles: [NativeSaleHandle] }

struct NativeSaleLimits: Codable, Equatable {
    let tier: String
    /// `nil` is unlimited.
    let openSales: Int?
    let buyersPerSale: Int
}

struct NativeSaleMeetPoint: Codable, Equatable {
    let lat: Double
    let lng: Double
    let placeName: String?
    let areaLabel: String?
}

struct NativeSaleRequest: Codable, Equatable, Identifiable {
    let requestId: String
    let buyerName: String
    let status: String
    let arrivedAt: String?
    let createdAt: String
    var id: String { requestId }
}

struct NativeOwnSale: Codable, Equatable, Identifiable {
    let saleId: String
    let title: String
    let priceCents: Int
    let state: String
    let shareUrl: String
    let meetPoint: NativeSaleMeetPoint?
    let windowStart: String
    let windowEnd: String
    let buyerLimit: Int
    let providers: [String]
    let requests: [NativeSaleRequest]
    var id: String { saleId }

    var isOpen: Bool { state == "open" }
    var windowStartDate: Date? { ISO8601DateFormatter.partyControlDate(from: windowStart) }
    var windowEndDate: Date? { ISO8601DateFormatter.partyControlDate(from: windowEnd) }
    var shareURL: URL? { NativePartyShareLink.url(from: shareUrl) }
    var approvedCount: Int { requests.filter { $0.status == "approved" }.count }
    var pendingCount: Int { requests.filter { $0.status == "pending" }.count }
}

struct NativeOwnSaleList: Codable {
    let limits: NativeSaleLimits
    let sales: [NativeOwnSale]
}

struct NativeSaleCreated: Codable { let saleId: String; let shareUrl: String }

/// Mirrors the server's rules so the seller hears about a problem before sending.
enum NativePrivateSalePolicy {
    static let maxBuyersPerSale = 5
    static let maxWindow: TimeInterval = 4 * 60 * 60
    static let maxLead: TimeInterval = 7 * 24 * 60 * 60
    static let startGrace: TimeInterval = 5 * 60
    static let windowLengths: [Int] = [30, 60, 120, 180, 240]

    private static let prefixes: [NativeSalePaymentProvider: String] = [
        .paypal: #"^(?:https?://)?(?:www\.)?paypal\.me/"#,
        .cashapp: #"^(?:https?://)?(?:www\.)?cash\.app/\$?|^\$"#,
        .venmo: #"^(?:https?://)?(?:www\.|account\.)?venmo\.com/(?:u/)?|^@"#,
    ]
    private static let patterns: [NativeSalePaymentProvider: String] = [
        .paypal: #"^[A-Za-z0-9]{1,20}$"#,
        .cashapp: #"^(?=.*[A-Za-z])[A-Za-z0-9_]{1,20}$"#,
        .venmo: #"^[A-Za-z0-9_-]{5,30}$"#,
    ]

    /// The handle as the server stores it, or nil when the provider wouldn't issue it.
    static func normalizedHandle(_ provider: NativeSalePaymentProvider, _ raw: String) -> String? {
        let handle = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: prefixes[provider] ?? "", with: "", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"[/?#].*$"#, with: "", options: .regularExpression)
        guard let pattern = patterns[provider], handle.range(of: pattern, options: .regularExpression) != nil else { return nil }
        return handle
    }

    static func handleURL(_ provider: NativeSalePaymentProvider, _ handle: String) -> URL? {
        switch provider {
        case .paypal: return URL(string: "https://paypal.me/\(handle)")
        case .cashapp: return URL(string: "https://cash.app/$\(handle)")
        case .venmo: return URL(string: "https://venmo.com/u/\(handle)")
        }
    }

    /// Dollars as typed ("12", "$12.50", "1,200") to cents, or nil.
    static func priceCents(from text: String) -> Int? {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "")
        guard !cleaned.isEmpty, cleaned.range(of: #"^\d+(\.\d{1,2})?$"#, options: .regularExpression) != nil,
              let dollars = Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
        let cents = NSDecimalNumber(decimal: dollars * 100).intValue
        return (0...10_000_000).contains(cents) ? cents : nil
    }

    static func priceLabel(cents: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.locale = Locale(identifier: "en_US")
        formatter.minimumFractionDigits = cents % 100 == 0 ? 0 : 2
        formatter.maximumFractionDigits = formatter.minimumFractionDigits
        return formatter.string(from: NSNumber(value: Double(cents) / 100)) ?? "$\(cents / 100)"
    }

    /// Why a meet window would be refused, or nil when it's fine.
    static func windowProblem(start: Date, end: Date, now: Date = Date()) -> String? {
        if start < now.addingTimeInterval(-startGrace) { return "The meet window has to start in the future." }
        if start.timeIntervalSince(now) > maxLead { return "The meet window has to start within 7 days." }
        if end <= start { return "The meet window has to end after it starts." }
        if end.timeIntervalSince(start) > maxWindow { return "The meet window can be at most 4 hours long." }
        return nil
    }

    /// An hour from now, on the next quarter hour.
    static func defaultStart(now: Date = Date()) -> Date {
        let quarter: TimeInterval = 15 * 60
        return Date(timeIntervalSinceReferenceDate: (now.addingTimeInterval(60 * 60).timeIntervalSinceReferenceDate / quarter).rounded(.up) * quarter)
    }

    static func buyerLimitRange(_ limits: NativeSaleLimits?) -> ClosedRange<Int> {
        1...max(1, min(maxBuyersPerSale, limits?.buyersPerSale ?? 1))
    }

    static func canOpenAnother(limits: NativeSaleLimits?, sales: [NativeOwnSale]) -> Bool {
        guard let limits else { return false }
        guard let cap = limits.openSales else { return true }
        return sales.filter(\.isOpen).count < cap
    }

    static func limitCaption(_ limits: NativeSaleLimits) -> String {
        let sales = limits.openSales.map { "\($0) open sale\($0 == 1 ? "" : "s")" } ?? "Unlimited open sales"
        return "\(limits.tier.capitalized) · \(sales) · up to \(limits.buyersPerSale) buyer\(limits.buyersPerSale == 1 ? "" : "s") each"
    }

    /// "123 Peachtree St, Atlanta, GA 30303" → "Atlanta".
    static func areaLabel(fromAddress address: String) -> String? {
        let parts = address.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard parts.count >= 3 else { return nil }
        let area = parts[parts.count - 2]
        return (2...60).contains(area.count) ? area : nil
    }

    static func stateLabel(_ state: String) -> String {
        switch state {
        case "open": return "Open"
        case "sold": return "Sold"
        case "cancelled": return "Cancelled"
        default: return "Ended"
        }
    }

    static func requestLabel(_ status: String) -> String {
        switch status {
        case "approved": return "Approved"
        case "declined": return "Declined"
        case "withdrawn": return "Withdrawn"
        default: return "Waiting for you"
        }
    }
}

enum NativePrivateSaleFailure {
    /// Server refusals name what to fix, so they're shown as they are.
    static func message(for error: Error, fallback: String) -> String {
        guard case let BytspotAPIClient.APIError.server(_, body) = error else { return "Couldn't reach Bytspot. Try again." }
        let said = NativePlanDemandFailure.serverMessage(in: body)
        return said.isEmpty ? fallback : said
    }
}

struct NativePrivateSalesAPI {
    let client: BytspotAPIClient

    private func decode<T: Decodable>(_ type: T.Type, _ payload: Any) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: payload))
    }

    func handles() async throws -> [NativeSaleHandle] {
        try decode(NativeSaleHandleList.self, try await client.trpcPayload(path: "/trpc/sales.handles.list")).handles
    }

    func saveHandle(provider: NativeSalePaymentProvider, handle: String, displayName: String) async throws {
        _ = try await client.trpcPayload(path: "/trpc/sales.handles.save", method: "POST", input: [
            "provider": provider.rawValue, "handle": handle, "displayName": displayName,
            "ownershipConfirmed": true, "goodsAndServices": true,
        ])
    }

    func removeHandle(provider: NativeSalePaymentProvider) async throws {
        _ = try await client.trpcPayload(path: "/trpc/sales.handles.remove", method: "POST", input: ["provider": provider.rawValue])
    }

    func mine() async throws -> NativeOwnSaleList {
        try decode(NativeOwnSaleList.self, try await client.trpcPayload(path: "/trpc/sales.mine"))
    }

    func create(title: String, priceCents: Int, place: NativePlaceSearchResult, latitude: Double, longitude: Double,
                start: Date, end: Date, buyerLimit: Int, providers: [NativeSalePaymentProvider]) async throws -> NativeSaleCreated {
        var meetPoint: [String: Any] = ["lat": latitude, "lng": longitude, "placeName": String(place.name.prefix(80))]
        if let area = NativePrivateSalePolicy.areaLabel(fromAddress: place.address) { meetPoint["areaLabel"] = area }
        let payload = try await client.trpcPayload(path: "/trpc/sales.create", method: "POST", input: [
            "title": title, "priceCents": priceCents, "meetPoint": meetPoint,
            "windowStart": ISO8601DateFormatter.partyControlInstant.string(from: start),
            "windowEnd": ISO8601DateFormatter.partyControlInstant.string(from: end),
            "buyerLimit": buyerLimit, "providers": providers.map(\.rawValue),
        ])
        return try decode(NativeSaleCreated.self, payload)
    }

    func updateWindow(saleID: String, start: Date, end: Date) async throws {
        _ = try await client.trpcPayload(path: "/trpc/sales.update", method: "POST", input: [
            "saleId": saleID,
            "windowStart": ISO8601DateFormatter.partyControlInstant.string(from: start),
            "windowEnd": ISO8601DateFormatter.partyControlInstant.string(from: end),
        ])
    }

    func close(saleID: String, sold: Bool) async throws {
        _ = try await client.trpcPayload(path: "/trpc/sales.close", method: "POST", input: ["saleId": saleID, "outcome": sold ? "sold" : "cancelled"])
    }

    func decide(requestID: String, approve: Bool) async throws {
        _ = try await client.trpcPayload(path: approve ? "/trpc/sales.approve" : "/trpc/sales.decline", method: "POST", input: ["requestId": requestID])
    }
}

// MARK: - Shared look

/// The Map card style: blurred glass with the sky inside.
private struct NativeSaleCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        return content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NativeMapGlass(shape: shape))
            .overlay(shape.stroke(Color.white.opacity(0.12)))
    }
}

private extension View {
    func saleCard() -> some View { modifier(NativeSaleCardStyle()) }

    func saleField() -> some View {
        self.padding(.horizontal, 12).frame(minHeight: 44)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct NativeSaleLabel: View {
    let text: String
    var color: Color = NativeTheme.cyan
    var body: some View {
        Text(text.uppercased()).font(.system(size: 10, weight: .black)).tracking(1.3).foregroundColor(color)
    }
}

private struct NativeSalePrimaryButton: View {
    let title: String
    var busy = false
    let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled
    var body: some View {
        Button(action: { nativeImpactLight(); action() }) {
            HStack(spacing: 8) {
                if busy { ProgressView().tint(.black) }
                Text(title).font(.system(size: 15, weight: .black))
            }
            .foregroundColor(.black).frame(maxWidth: .infinity, minHeight: 48)
            .background(NativeTheme.cyan.opacity(isEnabled ? 1 : 0.4)).clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

private struct NativeSaleSheetHeader: View {
    let eyebrow: String
    let title: String
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                NativeSaleLabel(text: eyebrow, color: NativeTheme.purple)
                Text(title).font(.system(size: 24, weight: .black)).foregroundColor(NativeTheme.textPrimary).accessibilityAddTraits(.isHeader)
            }
            Spacer()
            Button(action: { dismiss() }) {
                Image(systemName: "xmark.circle.fill").font(.system(size: 25, weight: .bold)).foregroundColor(NativeTheme.textSecondary)
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close")
        }
    }
}

// MARK: - Network → Hosting card

/// One card in Network → Hosting: open sales, the membership limit and
/// "New private sale".
struct NativePrivateSalesCard: View {
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    let requestAuthentication: () -> Void
    @State private var sales: [NativeOwnSale] = []
    @State private var limits: NativeSaleLimits?
    @State private var message = ""
    @State private var sheet: SaleSheet?

    private enum SaleSheet: Identifiable, Equatable {
        case create, handles, manage(String)
        var id: String {
            switch self {
            case .create: return "create"
            case .handles: return "handles"
            case .manage(let saleID): return "manage-\(saleID)"
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                NativeSaleLabel(text: "Private Sales")
                Spacer()
                if sessionStore.isAuthenticated {
                    Text("\(sales.filter(\.isOpen).count) active").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textSecondary)
                }
            }
            Text("Sell an item to people you choose. Buyers see the meet point only after you approve them, and they pay you directly.")
                .font(.system(size: 12.5, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if sessionStore.isAuthenticated {
                ForEach(sales.prefix(8)) { sale in saleRow(sale) }
                let canOpen = NativePrivateSalePolicy.canOpenAnother(limits: limits, sales: sales)
                NativeSalePrimaryButton(title: "New private sale") { sheet = .create }
                    .disabled(!canOpen)
                    .accessibilityIdentifier("native-private-sale-new")
                if let limits {
                    Text(canOpen ? NativePrivateSalePolicy.limitCaption(limits)
                         : "Your membership allows \(limits.openSales ?? 0) open sale\(limits.openSales == 1 ? "" : "s") at a time. Close one to start another.")
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                }
                Button(action: { sheet = .handles }) {
                    Label("Payment handles", systemImage: "creditcard").font(.system(size: 12.5, weight: .bold)).foregroundColor(NativeTheme.cyan)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-private-sale-handles")
            } else {
                NativeSalePrimaryButton(title: "Sign in to sell", action: requestAuthentication)
            }
            if !message.isEmpty {
                Text(message).font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.orange)
            }
        }
        .saleCard()
        .accessibilityIdentifier("native-private-sales-card")
        .task(id: sessionStore.isAuthenticated) { await reload() }
        .sheet(item: $sheet, onDismiss: { Task { await reload() } }) { target in
            Group {
                switch target {
                case .create: NativePrivateSaleCreateView(limits: limits)
                case .handles: NativePrivateSaleHandlesView()
                case .manage(let saleID): NativePrivateSaleManageView(saleID: saleID)
                }
            }
            .environmentObject(sessionStore)
        }
    }

    private func saleRow(_ sale: NativeOwnSale) -> some View {
        Button(action: { nativeImpactLight(); sheet = .manage(sale.saleId) }) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(sale.title).font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textPrimary).lineLimit(1)
                    Text("\(NativePrivateSalePolicy.priceLabel(cents: sale.priceCents)) · \(sale.windowStartDate?.formatted(date: .abbreviated, time: .shortened) ?? "")")
                        .font(.system(size: 11.5, weight: .semibold)).foregroundColor(NativeTheme.textSecondary).lineLimit(1)
                    if sale.isOpen && sale.pendingCount > 0 {
                        Text("\(sale.pendingCount) waiting for you").font(.system(size: 9.5, weight: .black)).foregroundColor(NativeTheme.amber)
                    }
                }
                Spacer()
                Text(NativePrivateSalePolicy.stateLabel(sale.state)).font(.system(size: 11, weight: .black))
                    .foregroundColor(sale.isOpen ? .black : NativeTheme.textSecondary)
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(sale.isOpen ? NativeTheme.cyan : Color.white.opacity(0.1)).clipShape(Capsule())
            }
            .padding(12)
            .background(Color.white.opacity(sale.isOpen ? 0.08 : 0.04))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("native-private-sale-\(sale.saleId)")
    }

    @MainActor private func reload() async {
        guard sessionStore.isAuthenticated, let token = sessionStore.token else { sales = []; limits = nil; return }
        do {
            let list = try await NativePrivateSalesAPI(client: BytspotAPIClient(tokenProvider: { token })).mine()
            sales = list.sales.sorted { $0.isOpen && !$1.isOpen }
            limits = list.limits
            message = ""
        } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "Your private sales couldn't load.")
        }
    }
}

// MARK: - Payment handles

struct NativePrivateSaleHandlesView: View {
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    @Environment(\.openURL) private var openURL
    var embedded = false
    var onChange: () -> Void = {}
    @State private var handles: [NativeSaleHandle] = []
    @State private var provider: NativeSalePaymentProvider = .paypal
    @State private var handleText = ""
    @State private var displayName = ""
    @State private var ownsIt = false
    @State private var goodsAndServices = false
    @State private var openedLink = false
    @State private var busy = false
    @State private var message = ""

    private var normalized: String? { NativePrivateSalePolicy.normalizedHandle(provider, handleText) }
    private var canSave: Bool {
        normalized != nil && openedLink && ownsIt && goodsAndServices && !displayName.trimmingCharacters(in: .whitespaces).isEmpty && !busy
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                if !embedded { NativeSaleSheetHeader(eyebrow: "Private Sales", title: "Payment handles") }
                if !handles.isEmpty { savedHandles }
                addHandle
                Text("Buyers see your handle labelled \"Seller-confirmed handle\". PayPal, Cash App and Venmo don't let Bytspot check who owns a handle, so it rests on what you confirm here.")
                    .font(.system(size: 11.5, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(20)
        }
        .foregroundColor(NativeTheme.textPrimary)
        .background(NativeDeepSpaceGround())
        .navigationTitle(embedded ? "Payment handles" : "")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarHidden(!embedded)
        .accessibilityIdentifier("native-private-sale-handles-view")
        .task { await reload() }
        .onChange(of: provider) { _ in handleText = ""; openedLink = false; goodsAndServices = false }
        .onChange(of: handleText) { _ in openedLink = false }
    }

    private var savedHandles: some View {
        VStack(alignment: .leading, spacing: 10) {
            NativeSaleLabel(text: "Saved")
            ForEach(handles) { saved in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("\(saved.provider.title) · \(saved.handle)").font(.system(size: 14, weight: .black))
                        Text("Shows \"\(saved.displayName)\" · confirmed \(ISO8601DateFormatter.partyControlDate(from: saved.confirmedAt)?.formatted(date: .abbreviated, time: .omitted) ?? "")")
                            .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                    }
                    Spacer()
                    Button("Remove") { Task { await remove(saved.provider) } }
                        .font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.orange)
                        .frame(minHeight: 44).buttonStyle(.plain).disabled(busy)
                }
            }
        }
        .saleCard()
    }

    private var addHandle: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeSaleLabel(text: handles.isEmpty ? "Add a handle" : "Add or replace a handle")
            Picker("Provider", selection: $provider) {
                ForEach(NativeSalePaymentProvider.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            TextField(provider.placeholder, text: $handleText)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .saleField()
                .accessibilityIdentifier("native-private-sale-handle-field")
            if !handleText.isEmpty && normalized == nil {
                Text("That doesn't look like a \(provider.title) handle.").font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.orange)
            }
            Button(action: openOwnPage) {
                Label("Open my \(provider.title) page to check", systemImage: openedLink ? "checkmark.circle.fill" : "arrow.up.right.square")
                    .font(.system(size: 13, weight: .bold)).foregroundColor(normalized == nil ? NativeTheme.textTertiary : NativeTheme.cyan)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .disabled(normalized == nil)
            TextField("Name shown on that page", text: $displayName)
                .saleField()
            Toggle("It's my own account and shows this name", isOn: $ownsIt)
                .font(.system(size: 13, weight: .semibold))
            Toggle(provider.goodsAndServicesStatement, isOn: $goodsAndServices)
                .font(.system(size: 13, weight: .semibold))
            if provider == .cashapp {
                Text("Cash App payments between people have no purchase protection. Buyers are told this.")
                    .font(.system(size: 11.5, weight: .semibold)).foregroundColor(NativeTheme.amber)
            }
            NativeSalePrimaryButton(title: "Save handle", busy: busy) { Task { await save() } }
                .disabled(!canSave)
            if !message.isEmpty {
                Text(message).font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.orange)
            }
        }
        .tint(NativeTheme.cyan)
        .saleCard()
    }

    private func openOwnPage() {
        guard let handle = normalized, let url = NativePrivateSalePolicy.handleURL(provider, handle) else { return }
        openedLink = true
        openURL(url)
    }

    private var api: NativePrivateSalesAPI? {
        guard let token = sessionStore.token else { return nil }
        return NativePrivateSalesAPI(client: BytspotAPIClient(tokenProvider: { token }))
    }

    @MainActor private func reload() async {
        guard let api else { return }
        do { handles = try await api.handles() } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "Your payment handles couldn't load.")
        }
    }

    @MainActor private func save() async {
        guard let api, let handle = normalized else { return }
        busy = true; defer { busy = false }
        do {
            try await api.saveHandle(provider: provider, handle: handle, displayName: displayName.trimmingCharacters(in: .whitespaces))
            handleText = ""; displayName = ""; ownsIt = false; goodsAndServices = false; openedLink = false; message = ""
            await reload()
            onChange()
        } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "The handle couldn't be saved.")
        }
    }

    @MainActor private func remove(_ provider: NativeSalePaymentProvider) async {
        guard let api else { return }
        busy = true; defer { busy = false }
        do { try await api.removeHandle(provider: provider); await reload(); onChange() } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "The handle couldn't be removed.")
        }
    }
}

// MARK: - Create

struct NativePrivateSaleCreateView: View {
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    let limits: NativeSaleLimits?
    @State private var title = ""
    @State private var priceText = ""
    @State private var placeQuery = ""
    @State private var places: [NativePlaceSearchResult] = []
    @State private var place: NativePlaceSearchResult?
    @State private var searching = false
    @State private var start = NativePrivateSalePolicy.defaultStart()
    @State private var minutes = 60
    @State private var buyerLimit = 1
    @State private var handles: [NativeSaleHandle] = []
    @State private var chosen: Set<NativeSalePaymentProvider> = []
    @State private var busy = false
    @State private var message = ""
    @State private var created: NativeSaleCreated?

    private var end: Date { start.addingTimeInterval(TimeInterval(minutes * 60)) }
    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var priceCents: Int? { NativePrivateSalePolicy.priceCents(from: priceText) }
    private var windowProblem: String? { NativePrivateSalePolicy.windowProblem(start: start, end: end) }
    private var canCreate: Bool {
        (3...80).contains(trimmedTitle.count) && priceCents != nil && place?.latitude != nil && place?.longitude != nil
            && windowProblem == nil && !chosen.isEmpty && !busy
    }

    var body: some View {
        NavigationView {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    NativeSaleSheetHeader(eyebrow: "Private Sales", title: created == nil ? "New private sale" : "Sale ready")
                    if let created { createdCard(created) } else { form }
                }
                .padding(20)
            }
            .foregroundColor(NativeTheme.textPrimary)
            .background(NativeDeepSpaceGround())
            .navigationBarHidden(true)
        }
        .navigationViewStyle(.stack)
        .tint(NativeTheme.cyan)
        .accessibilityIdentifier("native-private-sale-create")
        .task { await loadHandles() }
    }

    @ViewBuilder private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeSaleLabel(text: "Item")
            TextField("What are you selling?", text: $title).saleField()
            HStack(spacing: 8) {
                Text("$").font(.system(size: 15, weight: .black)).foregroundColor(NativeTheme.textSecondary)
                TextField("Price", text: $priceText).keyboardType(.decimalPad)
            }
            .saleField()
            Text("The price is shown to buyers. Bytspot never takes or moves money.")
                .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
        }
        .saleCard()

        meetPointCard

        VStack(alignment: .leading, spacing: 12) {
            NativeSaleLabel(text: "Meet window")
            DatePicker("Starts", selection: $start, in: Date()...Date().addingTimeInterval(NativePrivateSalePolicy.maxLead))
                .font(.system(size: 14, weight: .semibold))
            HStack(spacing: 6) {
                ForEach(NativePrivateSalePolicy.windowLengths, id: \.self) { length in
                    Button(action: { minutes = length }) {
                        Text(length < 60 ? "\(length)m" : "\(length / 60)h").font(.system(size: 12.5, weight: .black))
                            .foregroundColor(minutes == length ? .black : NativeTheme.textPrimary)
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .background(minutes == length ? NativeTheme.cyan : Color.white.opacity(0.08)).clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(length) minutes")
                    .accessibilityAddTraits(minutes == length ? .isSelected : [])
                }
            }
            Text("Ends \(end.formatted(date: .omitted, time: .shortened)). The link closes for everyone when the window ends.")
                .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
            if let windowProblem {
                Text(windowProblem).font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.orange)
            }
        }
        .saleCard()

        VStack(alignment: .leading, spacing: 12) {
            NativeSaleLabel(text: "Buyers and payment")
            let range = NativePrivateSalePolicy.buyerLimitRange(limits)
            Stepper("Up to \(buyerLimit) approved buyer\(buyerLimit == 1 ? "" : "s")", value: $buyerLimit, in: range)
                .font(.system(size: 14, weight: .semibold))
            if range.upperBound == 1 {
                Text("Your membership allows 1 buyer per sale.").font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
            }
            if handles.isEmpty {
                Text("Add a payment handle so buyers can pay you directly.")
                    .font(.system(size: 12.5, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            }
            ForEach(handles) { saved in
                Toggle("\(saved.provider.title) · \(saved.handle)", isOn: Binding(
                    get: { chosen.contains(saved.provider) },
                    set: { on in if on { chosen.insert(saved.provider) } else { chosen.remove(saved.provider) } }))
                    .font(.system(size: 14, weight: .semibold))
            }
            NavigationLink(destination: NativePrivateSaleHandlesView(embedded: true, onChange: { Task { await loadHandles() } })
                .environmentObject(sessionStore)) {
                Label(handles.isEmpty ? "Add a payment handle" : "Manage payment handles", systemImage: "creditcard")
                    .font(.system(size: 13, weight: .bold)).foregroundColor(NativeTheme.cyan).frame(minHeight: 44)
            }
        }
        .saleCard()

        NativeSalePrimaryButton(title: "Create sale and get link", busy: busy) { Task { await create() } }
            .disabled(!canCreate)
            .accessibilityIdentifier("native-private-sale-create-submit")
        if !message.isEmpty {
            Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.orange)
        }
    }

    private var meetPointCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeSaleLabel(text: "Meet point")
            if let place {
                HStack(spacing: 10) {
                    Image(systemName: "mappin.circle.fill").foregroundColor(NativeTheme.emerald)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(place.name).font(.system(size: 14, weight: .black))
                        Text(place.address).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textSecondary).lineLimit(2)
                    }
                    Spacer()
                    Button("Change") { self.place = nil }
                        .font(.system(size: 12, weight: .black)).foregroundColor(NativeTheme.cyan).frame(minHeight: 44).buttonStyle(.plain)
                }
            } else {
                HStack(spacing: 8) {
                    TextField("Café, station entrance, store…", text: $placeQuery)
                        .submitLabel(.search)
                        .onSubmit { Task { await searchPlaces() } }
                    if searching { ProgressView() } else {
                        Button(action: { Task { await searchPlaces() } }) {
                            Image(systemName: "magnifyingglass").frame(minWidth: 44, minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Search places")
                    }
                }
                .saleField()
                ForEach(places) { result in
                    Button(action: { place = result; places = [] }) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(result.name).font(.system(size: 13.5, weight: .black)).foregroundColor(NativeTheme.textPrimary)
                            Text(result.address).font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textSecondary).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
            }
            Text("Pick a public place, never your home. Only buyers you approve see it, rounded to about 30 m, and only until the window ends.")
                .font(.system(size: 11, weight: .semibold)).foregroundColor(NativeTheme.textTertiary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .saleCard()
    }

    private func createdCard(_ created: NativeSaleCreated) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            NativeSaleLabel(text: "Share link", color: NativeTheme.emerald)
            Text(created.shareUrl).font(.system(size: 13, weight: .bold, design: .monospaced)).textSelection(.enabled)
            Text("Anyone with the link sees the item and price. The meet point stays hidden until you approve a request in Network → Hosting.")
                .font(.system(size: 12, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let url = NativePartyShareLink.url(from: created.shareUrl) {
                NativeSalePrimaryButton(title: "Share link") {
                    if !NativePartySharePresentation.share([url]) { message = "The link is ready to copy." }
                }
            }
            if !message.isEmpty { Text(message).font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.cyan) }
        }
        .saleCard()
    }

    private var api: NativePrivateSalesAPI? {
        guard let token = sessionStore.token else { return nil }
        return NativePrivateSalesAPI(client: BytspotAPIClient(tokenProvider: { token }))
    }

    @MainActor private func loadHandles() async {
        guard let api else { return }
        guard let loaded = try? await api.handles() else { return }
        handles = loaded
        chosen = chosen.intersection(loaded.map(\.provider))
        if chosen.isEmpty { chosen = Set(loaded.map(\.provider)) }
    }

    @MainActor private func searchPlaces() async {
        let query = placeQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 2 else { return }
        searching = true; defer { searching = false }
        places = (try? await NativeLiveDiscoveryAPI(client: BytspotAPIClient()).placesTextSearchAnywhere(query: query)) ?? []
        if places.isEmpty { message = "No places found. Try a nearby café or station." } else { message = "" }
    }

    @MainActor private func create() async {
        guard let api, let place, let latitude = place.latitude, let longitude = place.longitude, let priceCents else { return }
        busy = true; defer { busy = false }
        do {
            created = try await api.create(title: trimmedTitle, priceCents: priceCents, place: place, latitude: latitude, longitude: longitude,
                                           start: start, end: end, buyerLimit: buyerLimit,
                                           providers: NativeSalePaymentProvider.allCases.filter { chosen.contains($0) })
            message = ""
        } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "The sale couldn't be created.")
        }
    }
}

// MARK: - Manage

struct NativePrivateSaleManageView: View {
    @EnvironmentObject private var sessionStore: BytspotSessionStore
    let saleID: String
    @State private var sale: NativeOwnSale?
    @State private var loaded = false
    @State private var busy = false
    @State private var message = ""
    @State private var editingWindow = false
    @State private var newStart = NativePrivateSalePolicy.defaultStart()
    @State private var newMinutes = 60
    @State private var confirmClose = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                NativeSaleSheetHeader(eyebrow: "Private Sale", title: sale?.title ?? "Sale")
                if let sale {
                    summary(sale)
                    if sale.isOpen {
                        requests(sale)
                        window(sale)
                        closeControls
                    }
                } else if loaded {
                    Text("This sale isn't available.").font(.system(size: 14, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
                if !message.isEmpty {
                    Text(message).font(.system(size: 12, weight: .bold)).foregroundColor(NativeTheme.orange)
                }
            }
            .padding(20)
        }
        .foregroundColor(NativeTheme.textPrimary)
        .background(NativeDeepSpaceGround())
        .tint(NativeTheme.cyan)
        .accessibilityIdentifier("native-private-sale-manage")
        .task { await reload() }
        .confirmationDialog("Close this sale?", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("Mark as sold") { Task { await close(sold: true) } }
            Button("Cancel sale", role: .destructive) { Task { await close(sold: false) } }
            Button("Keep it open", role: .cancel) {}
        } message: {
            Text("The link stops working at once for every buyer.")
        }
    }

    private func summary(_ sale: NativeOwnSale) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(NativePrivateSalePolicy.priceLabel(cents: sale.priceCents)).font(.system(size: 22, weight: .black))
                Spacer()
                Text(NativePrivateSalePolicy.stateLabel(sale.state)).font(.system(size: 11, weight: .black))
                    .foregroundColor(sale.isOpen ? .black : NativeTheme.textSecondary)
                    .padding(.horizontal, 10).frame(height: 28)
                    .background(sale.isOpen ? NativeTheme.cyan : Color.white.opacity(0.1)).clipShape(Capsule())
            }
            if let start = sale.windowStartDate, let end = sale.windowEndDate {
                Label("\(start.formatted(date: .abbreviated, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))", systemImage: "clock")
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            }
            if let placeName = sale.meetPoint?.placeName {
                Label(placeName, systemImage: "mappin.circle.fill").font(.system(size: 13, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
            }
            if sale.isOpen, let url = sale.shareURL {
                Button(action: {
                    nativeImpactLight()
                    if !NativePartySharePresentation.share([url]) { message = "The link is \(url.absoluteString)" }
                }) {
                    Label("Share link", systemImage: "square.and.arrow.up").font(.system(size: 13, weight: .black)).foregroundColor(NativeTheme.cyan)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("native-private-sale-share")
            }
        }
        .saleCard()
    }

    private func requests(_ sale: NativeOwnSale) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                NativeSaleLabel(text: "Requests")
                Spacer()
                Text("\(sale.approvedCount) of \(sale.buyerLimit) approved").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.textSecondary)
            }
            if sale.requests.isEmpty {
                Text("No requests yet. Share the link, then approve the buyers you want to meet. Only they see the meet point.")
                    .font(.system(size: 12.5, weight: .semibold)).foregroundColor(NativeTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(sale.requests) { request in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(request.buyerName).font(.system(size: 14, weight: .black))
                        Text(request.arrivedAt != nil ? "Arrived at the meet point" : NativePrivateSalePolicy.requestLabel(request.status))
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(request.arrivedAt != nil ? NativeTheme.emerald : NativeTheme.textSecondary)
                    }
                    Spacer()
                    if request.status == "pending" {
                        decisionButton("Decline", approve: false, request: request, filled: false)
                        decisionButton("Approve", approve: true, request: request, filled: true)
                            .disabled(sale.approvedCount >= sale.buyerLimit)
                    } else if request.status == "approved" {
                        decisionButton("Remove", approve: false, request: request, filled: false)
                    }
                }
                .padding(10)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityIdentifier("native-private-sale-request-\(request.requestId)")
            }
        }
        .saleCard()
    }

    private func decisionButton(_ title: String, approve: Bool, request: NativeSaleRequest, filled: Bool) -> some View {
        Button(action: { nativeImpactLight(); Task { await decide(request, approve: approve) } }) {
            Text(title).font(.system(size: 12, weight: .black))
                .foregroundColor(filled ? .black : NativeTheme.textPrimary)
                .padding(.horizontal, 12).frame(minHeight: 44)
                .background(filled ? NativeTheme.cyan : Color.white.opacity(0.1)).clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
    }

    private func window(_ sale: NativeOwnSale) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: {
                if !editingWindow { newStart = max(sale.windowStartDate ?? Date(), Date()); newMinutes = 60 }
                withAnimation(.easeOut(duration: 0.2)) { editingWindow.toggle() }
            }) {
                HStack {
                    NativeSaleLabel(text: "Change meet window")
                    Spacer()
                    Image(systemName: editingWindow ? "chevron.up" : "chevron.down").font(.system(size: 11, weight: .black)).foregroundColor(NativeTheme.cyan)
                }
                .frame(minHeight: 32)
            }
            .buttonStyle(.plain)
            if editingWindow {
                let newEnd = newStart.addingTimeInterval(TimeInterval(newMinutes * 60))
                DatePicker("Starts", selection: $newStart, in: Date()...Date().addingTimeInterval(NativePrivateSalePolicy.maxLead))
                    .font(.system(size: 14, weight: .semibold))
                Picker("Length", selection: $newMinutes) {
                    ForEach(NativePrivateSalePolicy.windowLengths, id: \.self) { Text($0 < 60 ? "\($0)m" : "\($0 / 60)h").tag($0) }
                }
                .pickerStyle(.segmented)
                if let problem = NativePrivateSalePolicy.windowProblem(start: newStart, end: newEnd) {
                    Text(problem).font(.system(size: 11.5, weight: .bold)).foregroundColor(NativeTheme.orange)
                }
                NativeSalePrimaryButton(title: "Save new window", busy: busy) { Task { await updateWindow(start: newStart, end: newEnd) } }
                    .disabled(busy || NativePrivateSalePolicy.windowProblem(start: newStart, end: newEnd) != nil)
            }
        }
        .saleCard()
    }

    private var closeControls: some View {
        Button(action: { confirmClose = true }) {
            Text("Mark sold or cancel").font(.system(size: 14, weight: .black)).foregroundColor(NativeTheme.orange)
                .frame(maxWidth: .infinity, minHeight: 48)
                .overlay(Capsule().stroke(NativeTheme.orange.opacity(0.6)))
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityIdentifier("native-private-sale-close")
    }

    private var api: NativePrivateSalesAPI? {
        guard let token = sessionStore.token else { return nil }
        return NativePrivateSalesAPI(client: BytspotAPIClient(tokenProvider: { token }))
    }

    /// Every action reloads, so the screen shows what the server holds, not what was asked for.
    @MainActor private func reload() async {
        guard let api else { loaded = true; return }
        do {
            sale = try await api.mine().sales.first { $0.saleId == saleID }
        } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "This sale couldn't load.")
        }
        loaded = true
    }

    @MainActor private func decide(_ request: NativeSaleRequest, approve: Bool) async {
        guard let api else { return }
        busy = true; defer { busy = false }
        do { try await api.decide(requestID: request.requestId, approve: approve); message = "" } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "That request couldn't change.")
        }
        await reload()
    }

    @MainActor private func updateWindow(start: Date, end: Date) async {
        guard let api else { return }
        busy = true; defer { busy = false }
        do { try await api.updateWindow(saleID: saleID, start: start, end: end); editingWindow = false; message = "" } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "The meet window couldn't change.")
        }
        await reload()
    }

    @MainActor private func close(sold: Bool) async {
        guard let api else { return }
        busy = true; defer { busy = false }
        do { try await api.close(saleID: saleID, sold: sold); message = "" } catch {
            message = NativePrivateSaleFailure.message(for: error, fallback: "The sale couldn't close.")
        }
        await reload()
    }
}
