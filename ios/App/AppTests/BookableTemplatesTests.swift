import XCTest
@testable import App

final class BookableTemplatesTests: XCTestCase {
    private func loadCatalog() throws -> BookableTemplateCatalog {
        let tests = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let url = tests
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("contracts/bookable-templates.json")
        return try BookableTemplateCatalog.decode(from: Data(contentsOf: url))
    }

    func testCatalogDecodesCamelCaseKeysWithoutANewNoun() throws {
        let catalog = try loadCatalog()
        XCTAssertEqual(catalog.id, "bytspot.bookable-templates")
        XCTAssertEqual(catalog.native.swiftType, "BookableTemplateCatalog")
        XCTAssertEqual(catalog.native.kotlinType, "BookableTemplateCatalog")
        XCTAssertEqual(catalog.native.decodeKeyStrategy, "useDefaultKeys")
        XCTAssertTrue(catalog.coreNouns.contains(.sku))
        XCTAssertTrue(catalog.coreNouns.contains(.stall))
        XCTAssertTrue(catalog.coreNouns.contains(.stay))
        XCTAssertEqual(catalog.version, 8)
        XCTAssertGreaterThanOrEqual(catalog.templates.count, 12)
        XCTAssertNil(catalog.templates.first { $0.id.contains("TABLE_OBJECT") })
    }

    func testPassIsADerivedObjectNotAnInventedCoreNoun() throws {
        let catalog = try loadCatalog()
        XCTAssertEqual(catalog.coreNouns.count, 10)
        XCTAssertEqual(catalog.coreNouns, [.pin, .hang, .host, .room, .stay, .stall, .seller, .sku, .person, .circle])

        let pass = try XCTUnwrap(catalog.derivedObject(id: .pass))
        XCTAssertEqual(pass.states, ["ISSUED", "VERIFIED", "ADMITTED", "EXPIRED", "REVOKED"])
        XCTAssertEqual(pass.consumedBy, [.verify, .checkIn])
        XCTAssertTrue(pass.issuedBy.contains(.rsvp))
        for noun in pass.issuedFrom {
            XCTAssertTrue(catalog.coreNouns.contains(noun))
        }
        for template in catalog.templates {
            XCTAssertTrue(catalog.coreNouns.contains(template.noun), "\(template.id) noun must be a core noun")
        }
    }

    func testAnEntityDeclaresWhatItCanDoSoAGuestNeverPublishes() throws {
        let catalog = try loadCatalog()
        XCTAssertEqual(catalog.capabilities(for: .host), [.createHang, .invite, .book, .verify, .publish, .share, .cancel])
        XCTAssertTrue(catalog.capabilities(for: .seller).contains(.sell))
        XCTAssertTrue(catalog.entityCanExecute(.host, .createHang))
        XCTAssertFalse(catalog.entityCanExecute(.person, .createHang))
        XCTAssertFalse(catalog.entityCanExecute(.person, .publish))
        XCTAssertFalse(catalog.entityCanExecute(.seller, .rsvp))
        XCTAssertFalse(catalog.entityCanExecute(.pin, .book))

        let table = try XCTUnwrap(catalog.template(id: "dining.table-for-4"))
        let declared = table.capabilities
        XCTAssertTrue(catalog.canActorExecute(.person, .reserve, in: .published, declared: declared))
        XCTAssertFalse(catalog.canActorExecute(.person, .publish, in: .draft, declared: declared))
        XCTAssertFalse(catalog.canActorExecute(.seller, .rsvp, in: .published, declared: declared))
        XCTAssertTrue(catalog.canActorExecute(.seller, .cancel, in: .reserved, declared: declared))
        XCTAssertFalse(catalog.canActorExecute(.person, .reserve, in: .cancelled, declared: declared))

        let claimed = Set(catalog.entityCapabilities.flatMap(\.capabilities))
        for capability in catalog.capabilities {
            XCTAssertTrue(claimed.contains(capability.id), "\(capability.id) is unreachable: no entity declares it")
        }
        XCTAssertEqual(catalog.actorRoles.count, 9)
    }

    func testADiscoverCategoryIsALensOverSKUsNotAProductOfItsOwn() throws {
        let catalog = try loadCatalog()

        XCTAssertEqual(
            catalog.visibleDiscoverCategories().map(\.id),
            ["boutique_apartment", "mobility", "nightlife", "dining", "coffee", "shopping", "entertainment", "service", "fitness", "parking"]
        )
        XCTAssertEqual(catalog.visibleDiscoverCategories(includeVendorGated: true).count, 11)
        XCTAssertEqual(catalog.discoverCategory(id: "valet")?.vendorGated, true)

        // No dead rail, and no rail showing a SKU whose domain it disowns.
        for category in catalog.visibleDiscoverCategories(includeVendorGated: true) {
            let templates = catalog.templates(forDiscoverCategory: category.id)
            XCTAssertFalse(templates.isEmpty, "\(category.id) resolves to nothing")
            for template in templates {
                XCTAssertTrue(category.domains.contains(template.domain), "\(template.id) shown by a rail that disowns it")
            }
        }

        // No invisible supply.
        for domain in catalog.domains {
            XCTAssertFalse(catalog.discoverCategories(forDomain: domain.id).isEmpty, "\(domain.id) is unreachable")
        }

        // Cottage sits under Services next to wellness.
        XCTAssertEqual(catalog.discoverCategory(id: "service")?.domains, [.wellness, .green])
        XCTAssertEqual(catalog.discoverCategory(forTemplate: "green.local-service")?.id, "service")
        XCTAssertEqual(catalog.discoverCategory(forTemplate: "stall.valet")?.id, "valet")
        XCTAssertEqual(catalog.discoverCategory(forTemplate: "stall.reserved-parking")?.id, "parking")
    }

    func testASlotHoldsCapacityAndNeverHoldsABooking() throws {
        let catalog = try loadCatalog()
        let now = Date()

        XCTAssertEqual(catalog.resolveSlotState(BookableSlotCapacity(quantity: 5, committed: 0), now: now), .open)
        XCTAssertEqual(catalog.resolveSlotState(BookableSlotCapacity(quantity: 5, committed: 5), now: now), .full)
        XCTAssertEqual(BookableSlotCapacity(quantity: 5, committed: 9).remaining, 0)

        // A vendor closing a slot outranks demand, and time outranks everything.
        XCTAssertEqual(catalog.resolveSlotState(BookableSlotCapacity(quantity: 5, committed: 5, blocked: true), now: now), .blocked)
        let past = BookableSlotCapacity(quantity: 5, committed: 0, blocked: true, startsAt: now.addingTimeInterval(-60))
        XCTAssertEqual(catalog.resolveSlotState(past, now: now), .passed)
        XCTAssertFalse(catalog.canCommit(to: past, now: now))

        // Quantity can rise freely but never below what is already sold.
        let sold = BookableSlotCapacity(quantity: 5, committed: 3)
        XCTAssertEqual(sold.minimumQuantity, 3)
        XCTAssertTrue(catalog.canSetQuantity(sold, to: 3))
        XCTAssertFalse(catalog.canSetQuantity(sold, to: 2))
        XCTAssertFalse(catalog.canSetQuantity(sold, to: 1000))

        // A nightly stay, a rolling table and a fixed door time are three shapes.
        XCTAssertEqual(catalog.availabilityDefaults(for: .dining).slotKind, .rolling)
        XCTAssertEqual(catalog.availabilityDefaults(for: .stay).slotKind, .daily)
        XCTAssertEqual(catalog.availabilityDefaults(for: .stay).slotMinutes, 1440)
        XCTAssertEqual(catalog.availabilityDefaults(for: .events).slotKind, .fixed)
        XCTAssertEqual(catalog.availabilityDefaults(for: .stall).horizonDays, 14)

        // The calendar obeys the same two-part check as the SKU machine.
        XCTAssertTrue(catalog.canRunAvailabilityOperation(.owner, .openSlot, in: .closed))
        XCTAssertFalse(catalog.canRunAvailabilityOperation(.owner, .openSlot, in: .open))
        XCTAssertTrue(catalog.canRunAvailabilityOperation(.serviceProvider, .setQuantity, in: .open))
        XCTAssertFalse(catalog.canRunAvailabilityOperation(.door, .blockSlot, in: .open))
        for operation in catalog.availability.operations {
            XCTAssertFalse(catalog.canRunAvailabilityOperation(.owner, operation.id, in: .passed))
        }

        // The Services rail must carry the feed count the native client reads.
        XCTAssertEqual(catalog.discoverCategory(id: "service")?.minimumFeedCount, 3)
    }

    func testASeatIsASubsetOfTheBusinessAtTheLevelOfIdentity() throws {
        let catalog = try loadCatalog()

        // SELLER gains a lifecycle without becoming a second noun.
        XCTAssertEqual(catalog.seller.noun, .seller)
        XCTAssertEqual(catalog.seller.seats.grantsFrom, "staffRoles")
        XCTAssertEqual(catalog.seller.identity.publishableStates, [.active])
        XCTAssertEqual(catalog.seller.seats.grantingStates, [.active])

        // An ACTIVE business lets the owner seat hold everything it declares.
        let owner = try XCTUnwrap(catalog.staffRole(id: .owner))
        for capability in owner.capabilities {
            XCTAssertTrue(catalog.sellerStateAllows(.active, capability))
            XCTAssertFalse(catalog.sellerStateAllows(.closed, capability))
        }

        // Suspension silences the owner without a single role being edited.
        XCTAssertFalse(catalog.sellerStateAllows(.suspended, .sell))
        XCTAssertFalse(catalog.sellerStateAllows(.suspended, .publish))
        XCTAssertTrue(catalog.sellerStateAllows(.suspended, .refund))
        XCTAssertTrue(catalog.sellerStateAllows(.suspended, .checkIn))
        XCTAssertFalse(catalog.sellerStateAllows(.draft, .sell))

        // No seat can exceed the business, checked across every role and state.
        for role in catalog.staffRoles {
            for state in catalog.seller.identity.states {
                let effective = catalog.effectiveSeatCapabilities(role: role.id, seat: .active, seller: state)
                for capability in effective {
                    XCTAssertTrue(role.capabilities.contains(capability), "\(role.id) gained \(capability)")
                    XCTAssertTrue(catalog.sellerStateAllows(state, capability), "\(state) leaked \(capability)")
                }
            }
            // A seat that is not ACTIVE carries nothing, however senior.
            for seat in catalog.seller.seats.states where !catalog.seatGrants(seat) {
                XCTAssertTrue(catalog.effectiveSeatCapabilities(role: role.id, seat: seat, seller: .active).isEmpty)
            }
        }

        XCTAssertTrue(catalog.sellerCanPublish(.active))
        XCTAssertFalse(catalog.sellerCanPublish(.pending))
        XCTAssertFalse(catalog.sellerCanUseConsole(.closed))
    }

    func testNobodyCanMintAPeerOrASuperiorAndOnlyABusinessCanHire() throws {
        let catalog = try loadCatalog()

        XCTAssertEqual(catalog.grantableStaffRoles(.owner), [.manager, .staff, .door, .serviceProvider])
        XCTAssertEqual(catalog.grantableStaffRoles(.manager), [.staff, .door, .serviceProvider])
        // Hiring is an act of the business, which is what SELL already means.
        XCTAssertEqual(catalog.grantableStaffRoles(.staff), [])
        XCTAssertEqual(catalog.grantableStaffRoles(.door), [])
        XCTAssertEqual(catalog.grantableStaffRoles(.serviceProvider), [])

        for role in catalog.staffRoles {
            XCTAssertFalse(catalog.canGrantStaffRole(role.id, role.id), "\(role.id) clones itself")
            if role.id != .owner {
                XCTAssertFalse(catalog.canGrantStaffRole(role.id, .owner), "\(role.id) escalates")
            }
        }

        // The owner seat cannot be removed, because that orphans its inventory.
        XCTAssertTrue(catalog.canRunSeatOperation(granter: .owner, target: .manager, operation: .revoke, state: .active))
        XCTAssertFalse(catalog.canRunSeatOperation(granter: .owner, target: .owner, operation: .revoke, state: .active))
        XCTAssertFalse(catalog.canRunSeatOperation(granter: .manager, target: .manager, operation: .suspend, state: .active))
        XCTAssertFalse(catalog.canRunSeatOperation(granter: .owner, target: .manager, operation: .suspend, state: .revoked))
        // An invite is the only seat operation with no prior state.
        XCTAssertTrue(catalog.canRunSeatOperation(granter: .owner, target: .door, operation: .invite, state: nil))
        XCTAssertFalse(catalog.canRunSeatOperation(granter: .owner, target: .door, operation: .invite, state: .active))

        // Approval belongs to the platform; only the owner steers the business.
        for operation in catalog.seller.identity.operations {
            if operation.to == .active { XCTAssertEqual(operation.actor, .platform) }
            if operation.actor == .seller { XCTAssertEqual(operation.requiresRole, .owner) }
            XCTAssertFalse(catalog.canRunSellerOperation(.manager, operation.id, in: .draft))
        }
        XCTAssertTrue(catalog.canRunSellerOperation(.owner, .submit, in: .draft))
        XCTAssertFalse(catalog.canRunSellerOperation(.owner, .approve, in: .pending))
        XCTAssertFalse(catalog.canRunSellerOperation(.owner, .submit, in: .active))

        XCTAssertEqual(catalog.unmetSellerRequirements(.active, satisfied: []).map(\.id), ["activeLocation", "payoutAccount"])
        XCTAssertTrue(catalog.unmetSellerRequirements(.active, satisfied: ["activeLocation", "payoutAccount"]).isEmpty)
    }

    func testALocationIsAPinASellerHoldsAndItsKindDecidesWhoTravels() throws {
        let catalog = try loadCatalog()

        XCTAssertEqual(catalog.locations.derivesFrom, .pin)
        XCTAssertEqual(catalog.locations.heldBy, .seller)
        XCTAssertEqual(catalog.fulfillment(for: .fixed), .guestTravels)
        XCTAssertEqual(catalog.fulfillment(for: .visiting), .vendorTravels)

        // Travelling to a guest without a radius is an unbounded promise.
        for kind in catalog.locations.kinds where kind.fulfillment == .vendorTravels {
            XCTAssertTrue(kind.requiresRadius, "\(kind.id) travels but has no radius")
        }

        // A dining room is fixed; wellness and green genuinely carry both.
        XCTAssertEqual(catalog.locationKinds(for: .dining).map(\.id), [.fixed])
        XCTAssertEqual(catalog.locationKinds(for: .wellness).map(\.id), [.fixed, .visiting])
        XCTAssertEqual(catalog.locationKinds(for: .green).map(\.id), [.visiting, .fixed])
        XCTAssertEqual(catalog.locationKinds(for: .stall).first?.id, .zone)
        XCTAssertEqual(catalog.locationKinds(for: .automotive).first?.id, .mobile)

        // Only ACTIVE can back published inventory.
        XCTAssertTrue(catalog.locationCanPublish(.active))
        XCTAssertFalse(catalog.locationCanPublish(.draft))
        XCTAssertFalse(catalog.locationCanPublish(.closed))

        // A dispatch ETA only means something when the vendor is moving.
        XCTAssertTrue(catalog.etaKindAllows(.dispatch, .vendorTravels))
        XCTAssertFalse(catalog.etaKindAllows(.dispatch, .guestTravels))
        XCTAssertTrue(catalog.etaKindAllows(.readiness, .guestTravels))
        XCTAssertFalse(catalog.etaKindAllows(.readiness, .vendorTravels))
        XCTAssertTrue(catalog.etaKindAllows(BookableEtaKind.none, .guestTravels))

        // Every template's ETA must be servable from a kind its domain allows.
        for template in catalog.templates {
            let servable = catalog.locationKinds(for: template.domain).contains {
                catalog.etaKindAllows(template.timing.etaKind, $0.fulfillment)
            }
            XCTAssertTrue(servable, "\(template.id) promises an ETA no location kind can serve")
        }

        XCTAssertTrue(catalog.canRunLocationOperation(.owner, .activate, in: .draft))
        XCTAssertFalse(catalog.canRunLocationOperation(.owner, .activate, in: .active))
        XCTAssertFalse(catalog.canRunLocationOperation(.door, .pause, in: .active))
        for operation in catalog.locations.operations {
            XCTAssertFalse(catalog.canRunLocationOperation(.owner, operation.id, in: .closed))
        }
    }

    func testDemandStaysUnresolvedUntilRealCapacityCanAbsorbIt() throws {
        let catalog = try loadCatalog()

        XCTAssertEqual(catalog.demand.raisedBy, .person)
        XCTAssertEqual(catalog.demand.answeredBy, .seller)
        // Resolving to anything but a SKU would be a second booking path.
        XCTAssertEqual(catalog.demand.resolvesTo, .sku)

        // The capacity rule is the one that reads availability, and it runs last.
        XCTAssertEqual(catalog.demand.matchRules.map(\.id), [.category, .location, .party, .budget, .capacity])
        XCTAssertEqual(catalog.demand.matchRules.last?.id, .capacity)
        for rule in catalog.demand.matchRules {
            XCTAssertFalse(rule.missReason.isEmpty, "\(rule.id) has no reason a vendor can act on")
        }

        XCTAssertTrue(catalog.isDemandActionable(.open))
        XCTAssertTrue(catalog.isDemandActionable(.matched))
        for state in catalog.demand.terminalStates {
            XCTAssertFalse(catalog.isDemandActionable(state))
        }

        // Answering demand needs SELL, which staff and door do not hold.
        XCTAssertTrue(catalog.canRunDemandOperation(.owner, .offer, in: .matched))
        XCTAssertTrue(catalog.canRunDemandOperation(.manager, .offer, in: .matched))
        XCTAssertFalse(catalog.canRunDemandOperation(.staff, .offer, in: .matched))
        XCTAssertFalse(catalog.canRunDemandOperation(.door, .offer, in: .matched))
        XCTAssertFalse(catalog.canRunDemandOperation(.owner, .offer, in: .open))
        for state in catalog.demand.terminalStates {
            for operation in catalog.demand.operations {
                XCTAssertFalse(catalog.canRunDemandOperation(.owner, operation.id, in: state))
            }
        }
    }

    func testAStaffSeatIsASubsetOfTheBusinessNeverASuperset() throws {
        let catalog = try loadCatalog()
        let seller = Set(catalog.capabilities(for: .seller))

        XCTAssertEqual(catalog.staffRoles.map(\.id), [.owner, .manager, .staff, .door, .serviceProvider])
        for role in catalog.staffRoles {
            for capability in role.capabilities {
                XCTAssertTrue(seller.contains(capability), "\(role.id) claims \(capability), which SELLER cannot do")
            }
        }
        let owner = try XCTUnwrap(catalog.staffRole(id: .owner))
        for capability in seller {
            XCTAssertTrue(owner.capabilities.contains(capability), "owner is missing \(capability)")
        }

        XCTAssertTrue(catalog.staffRoleCan(.owner, .refund))
        XCTAssertFalse(catalog.staffRoleCan(.manager, .refund))
        XCTAssertFalse(catalog.staffRoleCan(.door, .refund))
        XCTAssertEqual(catalog.staffRole(id: .door)?.capabilities, [.checkIn, .verify])
        XCTAssertEqual(catalog.staffRole(id: .serviceProvider)?.scope, .assigned)

        let table = try XCTUnwrap(catalog.template(id: "dining.table-for-4"))
        let declared = table.capabilities
        XCTAssertTrue(catalog.canStaffExecute(.staff, .cancel, in: .reserved, declared: declared))
        XCTAssertFalse(catalog.canStaffExecute(.door, .cancel, in: .reserved, declared: declared))
        XCTAssertFalse(catalog.canStaffExecute(.owner, .cancel, in: .cancelled, declared: declared))
    }

    func testEtaKindSeparatesTheMeaningsOneStringUsedToCarry() throws {
        let catalog = try loadCatalog()
        XCTAssertEqual(catalog.template(id: "stall.valet")?.timing.etaKind, .dispatch)
        XCTAssertEqual(catalog.template(id: "stall.reserved-parking")?.timing.etaKind, .hold)
        XCTAssertEqual(catalog.template(id: "stay.hotel-room")?.timing.etaKind, .policy)
        XCTAssertEqual(catalog.template(id: "wellness.massage-60")?.timing.etaKind, .nextSlot)
        XCTAssertEqual(catalog.template(id: "dining.table-for-2")?.timing.etaKind, .readiness)
        for template in catalog.templates {
            XCTAssertTrue(catalog.etaKinds.contains(template.timing.etaKind))
            XCTAssertEqual(template.timing.etaKind == BookableEtaKind.none, template.tier == .green)
        }
    }

    func testExpiredHoldReturnsTheSkuToPublished() throws {
        let catalog = try loadCatalog()
        let table = try XCTUnwrap(catalog.template(id: "dining.table-for-4"))
        XCTAssertEqual(table.timing.holdSecs, 900)
        let reservedAt = Date(timeIntervalSince1970: 0)
        XCTAssertEqual(table.holdExpiresAt(reservedAt: reservedAt), Date(timeIntervalSince1970: 900))
        XCTAssertEqual(table.holdState(reservedAt: reservedAt, now: Date(timeIntervalSince1970: 899)), .reserved)
        XCTAssertEqual(table.holdState(reservedAt: reservedAt, now: Date(timeIntervalSince1970: 900)), .published)

        let valet = try XCTUnwrap(catalog.template(id: "stall.valet"))
        XCTAssertNil(valet.holdExpiresAt(reservedAt: reservedAt))

        let reserved = try XCTUnwrap(catalog.skuTransitions.first { $0.from == .reserved })
        XCTAssertTrue(reserved.to.contains(.published))

        for template in catalog.templates where template.capabilities.contains(.reserve) {
            XCTAssertGreaterThan(template.timing.holdSecs, 0, "\(template.id) reserves without a hold window")
        }
    }

    func testCheapPlatinumSkuIsNeverDemotedToGreenByPrice() throws {
        let catalog = try loadCatalog()
        XCTAssertEqual(catalog.floorCents(for: .black), 45000)
        XCTAssertEqual(catalog.floorCents(for: .platinum), 5000)
        XCTAssertEqual(catalog.floorCents(for: .green), 500)
        XCTAssertEqual(catalog.tierCandidates(category: "Parking"), [.platinum])
        XCTAssertEqual(catalog.tierCandidates(category: "Events"), [.black, .platinum])

        XCTAssertEqual(catalog.resolveTier(declared: nil, priceCents: 1200, category: "Parking"), .platinum)
        XCTAssertEqual(catalog.resolveTier(declared: nil, priceCents: 2500, category: "Events"), .platinum)
        XCTAssertEqual(catalog.resolveTier(declared: nil, priceCents: 350000, category: "Events"), .black)
        XCTAssertEqual(catalog.resolveTier(declared: "green", priceCents: 350000, category: "Events"), .green)
        XCTAssertEqual(catalog.resolveTier(declared: nil, priceCents: 1200, category: nil), .green)

        for template in catalog.templates {
            XCTAssertEqual(
                catalog.resolveTier(declared: nil, priceCents: template.priceCents, category: template.category),
                template.tier,
                "\(template.id) does not round-trip to its declared tier"
            )
        }
    }

    func testTableForFourPrintsADiningSKU() throws {
        let template = try XCTUnwrap(loadCatalog().template(id: "dining.table-for-4"))
        XCTAssertEqual(template.noun, .sku)
        XCTAssertEqual(template.schema, "table")
        XCTAssertEqual(template.tier, .platinum)
        XCTAssertEqual(template.priceCents, 6500)
        XCTAssertEqual(template.timing.etaLabel, "Seated in 20 min")
        XCTAssertEqual(template.maxGuests, 4)
        XCTAssertEqual(template.cta, "Reserve Table")
        XCTAssertTrue(template.capabilities.contains(.reserve))
        XCTAssertTrue(template.capabilities.contains(.book))
        XCTAssertTrue(template.canExecute(.reserve, in: .published))
        XCTAssertFalse(template.canExecute(.checkIn, in: .published))
    }

    func testReservedParkingProjectsToClipLocalServiceShape() throws {
        let clip = try XCTUnwrap(loadCatalog().template(id: "stall.reserved-parking")).clipLocalService()
        XCTAssertEqual(clip.id, "stall.reserved-parking")
        XCTAssertEqual(clip.action, "Reserve Spot")
        XCTAssertEqual(clip.iconName, "car.side.lock.fill")
        XCTAssertEqual(clip.category, "parking")
        XCTAssertEqual(clip.amountCents, 1200)
        XCTAssertEqual(clip.source, "curated")
    }

    func testGreenLocalServiceDoesNotDispatchAnETA() throws {
        let template = try XCTUnwrap(loadCatalog().template(id: "green.local-service"))
        XCTAssertEqual(template.tier, .green)
        XCTAssertEqual(template.timing.etaKind, BookableEtaKind.none)
        XCTAssertEqual(template.formEtaLabel, "")
        XCTAssertEqual(template.timing.holdSecs, 0)
        XCTAssertTrue(template.capabilities.contains(.book))
    }
}
