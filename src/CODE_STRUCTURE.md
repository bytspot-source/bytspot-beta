# Bytspot Code Structure Documentation

## 📁 Project Organization

### Core Application
```
/App.tsx                          # Main entry point with routing logic
/styles/globals.css               # Tailwind v4 + iOS Design System tokens
```

### Components Architecture

#### 🏠 Main App Components (`/components/`)
```
Landing & Onboarding:
├── SplashScreen.tsx              # Initial splash animation
├── LandingPage.tsx               # Marketing landing page
├── DataConsentFlow.tsx           # Privacy consent flow
├── AuthenticationFlow.tsx        # Sign up/Login
├── ProfileSetup.tsx              # User profile creation
├── InterestPreferences.tsx       # Interest selection
└── SpotDiscoveryCurating.tsx     # AI spot discovery onboarding

Main Tabs:
├── DiscoverSection.tsx           # Swipeable discovery cards + Stories
├── MapSection.tsx                # Interactive map with routing
├── InsiderSection.tsx            # Community social feed
├── ConciergeSection.tsx          # AI chat assistant
└── ProfileSection.tsx            # User profile & settings

Navigation & Search:
├── BottomNav.tsx                 # Tab bar navigation
├── AnimatedSearchPlaceholder.tsx # Rotating search hints
├── MapMenuSlideUp.tsx            # Map function selector
└── ZoneUserCount.tsx             # Live user counter

Shared Features:
├── QuickActionCard.tsx           # Home screen action cards
├── StoriesBar.tsx                # Horizontal stories scroll
├── EphemeralStoriesViewer.tsx    # Full-screen story viewer
├── EphemeralPostCreator.tsx      # Create story interface
├── ConciergeChat.tsx             # AI chat UI
├── VenueDetails.tsx              # Venue detail modal
├── VenueInsiderDetails.tsx       # Insider venue modal
├── ParkingSpotDetails.tsx        # Parking detail view
├── ParkingReservationFlow.tsx    # Parking booking flow
└── ValetFlow.tsx                 # Valet booking flow

Settings & Preferences:
├── PersonalInfoEdit.tsx          # Edit user info
├── VehicleManagement.tsx         # Manage vehicles
├── PaymentMethods.tsx            # Payment cards
├── NotificationSettings.tsx      # Notification preferences
├── LocationAccuracy.tsx          # Location settings
├── SensorSettings.tsx            # IoT sensor config
├── SensorManager.tsx             # Sensor management
├── ParkingPreferences.tsx        # Parking filters
└── VibePreferences.tsx           # Venue vibe settings
```

#### 🏢 Host Dashboard (`/components/host/`)
```
Entry Points:
├── HostApp.tsx                   # Host app router
├── HostLanding.tsx               # Host landing page
└── HostOnboarding.tsx            # Onboarding orchestrator

Onboarding Steps (/onboarding/):
├── Step1AccountCreation.tsx      # Account setup
├── Step2HostType.tsx             # Host type selection
├── Step3BusinessInfo.tsx         # Business details
├── Step4ListingDetails.tsx       # Spot details
├── Step5PricingSetup.tsx         # Pricing config
├── Step6Availability.tsx         # Calendar setup
├── Step7Verification.tsx         # Document verification
├── Step8PayoutSetup.tsx          # Payment setup
├── Step9ReviewSubmit.tsx         # Final review
└── Step10Complete.tsx            # Success screen

Dashboard Views (/dashboard/):
├── HostDashboardLayout.tsx       # Layout wrapper
├── DashboardHome.tsx             # Overview & analytics
├── DashboardListings.tsx         # Manage listings
├── DashboardBookings.tsx         # Booking management
├── DashboardCalendar.tsx         # Availability calendar
├── DashboardEarnings.tsx         # Revenue analytics
├── DashboardReviews.tsx          # Review management
└── DashboardSettings.tsx         # Host settings
```

#### 🚗 Valet Driver App (`/components/valet/`)
```
Entry Points:
├── ValetApp.tsx                  # Valet app router
└── ValetDashboard.tsx            # Main dashboard

Dashboard Views (/dashboard/):
├── ActiveJobsView.tsx            # Current jobs
├── JobHistoryView.tsx            # Past jobs
├── EarningsView.tsx              # Earnings tracker
└── DriverProfileView.tsx         # Driver profile
```

#### ⚖️ Legal Components (`/components/legal/`)
```
├── IndependentContractorAgreement.tsx    # Contractor agreement
├── ValetLiabilityWaiver.tsx              # Liability waiver
└── VehiclePhotoVerification.tsx          # Photo verification UI
```

#### 🎨 UI Components (`/components/ui/`)
**ShadCN/UI Library** - 42 components
```
Forms:
├── button.tsx, input.tsx, textarea.tsx
├── checkbox.tsx, radio-group.tsx, switch.tsx
├── select.tsx, slider.tsx, input-otp.tsx
└── form.tsx (React Hook Form integration)

Layout:
├── card.tsx, sheet.tsx, dialog.tsx
├── drawer.tsx, popover.tsx, tooltip.tsx
├── sidebar.tsx, resizable.tsx
└── separator.tsx, scroll-area.tsx

Navigation:
├── tabs.tsx, accordion.tsx, breadcrumb.tsx
├── navigation-menu.tsx, menubar.tsx
├── dropdown-menu.tsx, context-menu.tsx
└── pagination.tsx

Feedback:
├── alert.tsx, alert-dialog.tsx
├── toast/sonner.tsx, skeleton.tsx
├── progress.tsx, badge.tsx
└── hover-card.tsx

Data Display:
├── table.tsx, calendar.tsx
├── chart.tsx, carousel.tsx
├── avatar.tsx, aspect-ratio.tsx
├── collapsible.tsx, command.tsx
└── toggle.tsx, toggle-group.tsx

Utilities:
├── use-mobile.ts (Mobile detection hook)
└── utils.ts (Class name utilities)
```

#### 🖼️ Figma Integration (`/components/figma/`)
```
└── ImageWithFallback.tsx         # Protected image component
```

### Utilities & Logic (`/utils/`)
```
├── searchClassifier.ts           # AI search intent classification
├── personalization.ts            # Personalization engine
├── hostMockData.ts               # Host dashboard mock data
└── valetMockData.ts              # Valet app mock data
```

### Documentation (`/`)
```
├── IMPLEMENTATION_SUMMARY.md     # Feature documentation (400+ lines)
├── LEGAL_COMPLIANCE.md           # Legal compliance guide (500+ lines)
├── CODE_STRUCTURE.md             # This file
└── Attributions.md               # Image credits
```

### Design Guidelines (`/guidelines/`)
```
├── Guidelines.md                 # General guidelines
└── iOS-Design-System.md          # iOS design principles
```

---

## 🏗️ Architecture Patterns

### State Management
- **React useState** for local component state
- **localStorage** for persistence (auth, preferences, onboarding)
- **Props drilling** minimized with component composition
- No external state management library (keeps bundle small)

### Routing Strategy
```typescript
type AppScreen = 
  | 'splash'         // Initial splash
  | 'landing'        // Landing page
  | 'consent'        // Data consent
  | 'auth'           // Authentication
  | 'profile-setup'  // Profile creation
  | 'preferences'    // Interest selection
  | 'discovery'      // AI curation
  | 'main'           // Main app (Parker)
  | 'host'           // Host Dashboard
  | 'valet';         // Valet Driver App

// Tab navigation within 'main':
type Tab = 'home' | 'discover' | 'map' | 'insider' | 'concierge';
```

### Design System
- **iOS Design Language**: SF Pro typography, spring animations
- **Dark Mode Only**: OLED-optimized (currently)
- **Glassmorphism**: 80% opacity + backdrop blur
- **Mobile-First**: 393px (iPhone 14 Pro) optimized
- **8pt Grid System**: Consistent spacing
- **44px Tap Targets**: iOS minimum

### Animation Strategy
- **Motion (Framer Motion)**: All animations
- **Spring Physics**: `stiffness: 320, damping: 30, mass: 0.8`
- **Page Transitions**: Slide + fade (200ms)
- **Micro-interactions**: Scale on tap (0.95x)
- **Auto-hide Navigation**: Scroll-based in most tabs

### Data Flow
```
User Input → Search Classifier → Category/Navigation Decision
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    ↓                                    ↓
            Discover Tab (Swipe Cards)          Map Tab (Navigation)
                    ↓                                    ↓
            Detail Modal → Booking Flow        Route Display
```

---

## 🎯 Component Responsibilities

### DiscoverSection.tsx
- Swipeable card interface
- Stories bar integration
- Pull-to-refresh
- Filter support (parking/venue/valet/coffee/dining/etc.)
- Auto-hide bottom nav during scroll
- Modal flows (parking, valet, venue details)

### MapSection.tsx
- Interactive map display
- Route navigation
- Real-time parking spots
- AR Mode support
- Parking suggestions
- Multi-function support (navigate, find parking, valet request)

### InsiderSection.tsx
- Social feed
- Community posts
- Photo/video content
- Venue check-ins
- Engagement (like, comment, share)

### ConciergeSection.tsx
- AI chat interface
- Contextual suggestions
- Quick reply buttons
- Message history
- Voice input support

### ProfileSection.tsx
- User profile display
- Settings navigation
- Vehicle management
- Payment methods
- Preferences
- Host/Valet app entry points

---

## 🔧 Key Technical Decisions

### Why No Backend?
- **Demo/Prototype Focus**: Frontend showcase
- **Rapid Iteration**: No API dependencies
- **Legal Template**: Frontend implementation of compliance measures
- **Production Roadmap**: Clear backend requirements documented

### Why Three Apps in One Codebase?
- **Shared Design System**: Consistent UI/UX
- **Component Reusability**: Legal components, modals, etc.
- **Faster Development**: No context switching
- **Smaller Bundle**: Shared dependencies

### Why localStorage?
- **No Backend**: Local persistence needed
- **Demo Functionality**: Simulate authentication
- **User Preferences**: Remember onboarding state
- **Personalization Data**: Track behavior for AI

### Why Tailwind v4?
- **CSS Variables**: Better theming
- **Smaller Bundle**: Optimized output
- **Modern Syntax**: Cleaner code
- **Design Tokens**: iOS system integration

---

## 📊 Component Complexity Metrics

### Large Components (500+ lines)
- DiscoverSection.tsx (~860 lines) - Main swipeable card interface
- MapSection.tsx - Interactive map with multiple modes
- InsiderSection.tsx - Social feed with multiple post types
- ConciergeSection.tsx - Chat interface with suggestions

### Medium Components (200-500 lines)
- VenueDetails.tsx - Venue detail modal
- ParkingReservationFlow.tsx - Multi-step booking
- ValetFlow.tsx - Valet booking with add-ons
- EphemeralStoriesViewer.tsx - Story viewer
- ProfileSection.tsx - Settings hub

### Small Components (<200 lines)
- All UI components
- Quick action cards
- Story bar
- Bottom navigation
- Modal overlays

---

## 🚀 Performance Optimizations

### Bundle Size
- **Tree-shaking**: Only import used icons from lucide-react
- **Code Splitting**: Lazy load Host/Valet apps (future)
- **No Heavy Libraries**: Recharts only for charts

### Runtime Performance
- **Virtual Scrolling**: Not needed (manageable list sizes)
- **Memoization**: Used sparingly (React.memo for stable components)
- **Event Debouncing**: Search input, scroll handlers
- **Image Optimization**: Unsplash CDN, proper sizing

### Animation Performance
- **GPU Acceleration**: Transform/opacity only
- **Spring Physics**: Smooth, natural motion
- **Reduced Motion**: Respect user preferences (future)

---

## 🔐 Security & Privacy

### Current Implementation
- No real authentication (demo mode)
- No real payment processing (Stripe placeholders)
- No PII collection (mock data only)
- No backend communication

### Production Requirements
- Supabase Auth for user management
- Stripe Connect for payments
- E2E encryption for messages
- GDPR/CCPA compliance
- Background checks for valets
- Insurance verification

---

## 📱 Platform Support

### Optimized For
- **iPhone 14 Pro** (393px width) ✅
- **iOS Safari** ✅
- **Dark Mode** ✅

### Responsive Breakpoints
- Mobile: 393px (primary target)
- Tablet: 768px+ (basic support)
- Desktop: 1024px+ (host dashboard optimized)

### Browser Support
- Safari (iOS) - Primary
- Chrome (Android) - Supported
- Desktop browsers - Basic support

---

## 🎨 Design Token System

### Colors
```css
--brand-blue: #00BFFF
--brand-magenta: #FF00FF
--brand-orange: #FF4500
--accent-purple: #A855F7
--accent-pink: #D946EF
```

### Typography (SF Pro Scale)
```css
--text-large-title: 34px/41px (Semibold)
--text-title-1: 28px/34px (Bold)
--text-title-2: 22px/28px (Semibold)
--text-headline: 17px/22px (Semibold)
--text-body: 17px/22px (Regular)
--text-footnote: 13px/18px (Regular)
```

### Spacing (8pt Grid)
```css
--spacing-1: 8px
--spacing-2: 16px
--spacing-3: 24px
--spacing-4: 32px
--spacing-5: 40px
--spacing-6: 48px
```

---

## 🛠️ Development Workflow

### Adding a New Feature
1. Create component in `/components/`
2. Import in `App.tsx` or parent component
3. Add to routing logic if needed
4. Update this documentation
5. Test on mobile viewport (393px)

### Adding a New Tab
1. Add to `type Tab` in `App.tsx`
2. Create section component
3. Add to bottom nav
4. Add to AnimatePresence switch
5. Configure auto-hide behavior

### Adding a New Setting
1. Create component in `/components/`
2. Add to ProfileSection navigation
3. Store preferences in localStorage
4. Update personalization engine if needed

---

## 📝 Naming Conventions

### Files
- PascalCase for components: `DiscoverSection.tsx`
- camelCase for utilities: `searchClassifier.ts`
- kebab-case for CSS: `globals.css`
- UPPERCASE for docs: `README.md`

### Components
- Section suffix: Main tab views (`DiscoverSection`)
- Flow suffix: Multi-step processes (`ValetFlow`)
- View suffix: Dashboard pages (`ActiveJobsView`)
- Modal suffix: Overlays (`VenueDetails` - implied)

### Variables
- camelCase: `activeTab`, `isDarkMode`
- SCREAMING_SNAKE_CASE: Constants only
- Descriptive names: `selectedMapFunction` not `func`

---

## ✅ Code Quality Standards

### TypeScript
- ✅ All components typed
- ✅ Interfaces for props
- ✅ Type unions for states
- ✅ No `any` types (except Motion event types)

### React
- ✅ Functional components only
- ✅ Hooks for state management
- ✅ Props destructuring
- ✅ Key props on lists
- ✅ Cleanup in useEffect

### Styling
- ✅ Tailwind classes
- ✅ No inline styles (except dynamic values)
- ✅ CSS variables for themes
- ✅ Responsive classes

### Performance
- ✅ Debounced scroll handlers
- ✅ Lazy imports for heavy components (future)
- ✅ Optimized images
- ✅ Minimal re-renders

---

## 🔮 Future Enhancements

### High Priority
- [ ] Remove duplicate/unused components
- [ ] Split large components (>500 lines)
- [ ] Add error boundaries
- [ ] Implement offline mode
- [ ] Add light mode theme

### Medium Priority
- [ ] Lazy load Host/Valet apps
- [ ] Add analytics tracking
- [ ] Implement saved spots
- [ ] Add price alerts
- [ ] Social sharing

### Low Priority
- [ ] Widget support
- [ ] Watch app integration
- [ ] CarPlay support
- [ ] Siri shortcuts

---

## 📞 Integration Points

### Ready for Backend
```typescript
// Authentication
localStorage.getItem('bytspot_auth_token')

// User Preferences
localStorage.getItem('bytspot_preferences')

// Personalization Data
localStorage.getItem('bytspot_behavior_data')
```

### API Placeholders
- Stripe Connect (payment processing)
- Mapbox (map rendering)
- Unsplash (images - demo only)
- Background check API
- Insurance verification API

---

## 📈 Metrics & Analytics (Future)

### User Behavior Tracking
- Search queries (category classification)
- Category clicks (personalization)
- Location visits (recommendations)
- Booking completions
- Story engagement

### Performance Monitoring
- Page load times
- Animation frame rates
- API response times
- Error rates

### Business Metrics
- User acquisition
- Conversion rates
- Revenue per user
- Retention rates

---

**Last Updated:** October 10, 2025  
**Version:** 1.0  
**Status:** Production Demo Ready
