import SwiftUI

struct BytspotNativeAppRoot: View {
    @StateObject private var sessionStore = BytspotSessionStore()
    @StateObject private var bridgeStore = NativeBridgeStore()
    @StateObject private var navigation = NativeNavigationCoordinator()
    @StateObject private var authCoordinator = NativeAuthCoordinator()
    @StateObject private var apiState = NativeAPIState()
    @StateObject private var tabContentStore = NativeTabContentStore()
    @StateObject private var membershipStore = NativeMembershipStore()

    init() {
        #if DEBUG
        NativeAuthSeamSelfTests.runIfRequested()
        NativePatchRouteSelfTests.runIfRequested()
        NativePatchBookingSelfTests.runIfRequested()
        NativePatchSpecialFlowSelfTests.runIfRequested()
        NativeShellThemeSelfTests.runIfRequested()
        NativeHomeParitySelfTests.runIfRequested()
        NativeMapParitySelfTests.runIfRequested()
        NativeAccessParitySelfTests.runIfRequested()
        NativeBookingParitySelfTests.runIfRequested()
        NativeAccountParitySelfTests.runIfRequested()
        NativeDiscoverParitySelfTests.runIfRequested()
        NativeConciergeParitySelfTests.runIfRequested()
        NativePhase4TabContentSelfTests.runIfRequested()
        #endif
    }

    var body: some View {
        BytspotNativeShellView(bridgeStore: bridgeStore, navigation: navigation)
            .environmentObject(sessionStore)
            .environmentObject(authCoordinator)
            .environmentObject(apiState)
            .environmentObject(tabContentStore)
            .environmentObject(membershipStore)
            .onAppear {
                navigation.drainPendingURLs()
                bridgeStore.injectPatchScanBridgeSmokeTestIfRequested()
            }
            .task {
                await tabContentStore.refresh(sessionStore: sessionStore)
                await membershipStore.refresh(sessionStore: sessionStore)
            }
            .onChange(of: sessionStore.token ?? "") { _ in
                Task {
                    await tabContentStore.refresh(sessionStore: sessionStore)
                    await membershipStore.refresh(sessionStore: sessionStore)
                }
            }
            .onOpenURL { navigation.notifyPatchScanned(url: $0, source: .deepLink); _ = navigation.handle(url: $0) }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                if let url = activity.webpageURL {
                    navigation.notifyPatchScanned(url: url, source: .universalLink)
                    _ = navigation.handle(url: url)
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: NativeIncomingURLCenter.notification)) { notification in
                guard let url = notification.object as? URL else { return }
                let sourceRaw = notification.userInfo?[NativeIncomingURLCenter.scanSourceUserInfoKey] as? String
                let source = sourceRaw.flatMap(NativePatchScanSource.init(rawValue:)) ?? .universalLink
                navigation.notifyPatchScanned(url: url, source: source)
                if BytspotPatchRoute(url: url) == nil { _ = navigation.handle(url: url) }
            }
    }
}
