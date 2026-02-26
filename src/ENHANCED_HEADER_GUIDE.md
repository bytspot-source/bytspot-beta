# Enhanced Header System Guide

## Overview

The Bytspot app now features a production-ready, premium header system with smart search, personalized greetings, and context-aware information displays.

---

## Components

### 1. **EnhancedHeader** (`/components/EnhancedHeader.tsx`)

A sophisticated, scroll-reactive header with multiple information layers.

#### Features:

**Status Bar (Top Layer):**
- Real-time clock with minute precision
- Current weather with dynamic icons (sun/cloud based on time of day)
- Live zone activity counter (ZoneUserCount integration)
- Compact location badge (San Francisco)
- Animated profile menu button with rotating gradient

**Quick Stats Bar (Second Layer):**
- Live parking availability (342 spots nearby)
- Peak hours indicator with trending icon
- AI personalization count (8 recommendations)
- Glassmorphism effect with brand color gradients

**Large Title Section:**
- Time-based personalized greeting ("Good morning, [Name]")
- Animated brand logo (54px size)
- "Bytspot" wordmark with brand gradient
- Context-aware tagline changes by time:
  - Morning: "Start your day with the perfect parking spot"
  - Afternoon: "Find venues and activities around you"
  - Evening: "Discover nightlife and entertainment"

#### Scroll Behavior:

```typescript
// Header reacts to scroll position
- Opacity: 100% → 95% (0-100px scroll)
- Blur: 20px → 40px backdrop blur
- Title scale: 100% → 85% (0-50px scroll)
- Title opacity: 100% → 0% (0-80px scroll)
```

#### Usage:

```tsx
<EnhancedHeader 
  onProfileClick={() => setShowProfile(!showProfile)}
  scrollContainerRef={homeScrollRef}
/>
```

---

### 2. **SmartSearchBar** (`/components/SmartSearchBar.tsx`)

An intelligent search interface with suggestions, voice input, and recent history.

#### Features:

**Search Input:**
- Animated placeholder text rotation
- Clear button (X) appears when typing
- Voice input button with recording animation
- Focus state with scale animation (101%)
- Auto-blur backdrop effect

**Search Suggestions Dropdown:**
- **Recent Searches** (from localStorage, max 5)
  - Displays previously searched queries
  - "Clear" button to remove history
- **Trending Now** (3 items)
  - Popular searches with trending icon
  - Color-coded by category
- **Nearby Places** (2 items)
  - Location-based suggestions
  - MapPin icon with cyan color

**Voice Input:**
- Full-screen overlay when listening
- Pulsing microphone icon
- Progress bar indicator
- Mock voice recognition (2s delay)
- Example prompt: "Try saying 'Find parking near me'"

#### Search Suggestion Types:

```typescript
interface SearchSuggestion {
  id: string;
  text: string;
  type: 'recent' | 'trending' | 'nearby' | 'category';
  icon: React.ReactNode;
  category?: string; // For category-based navigation
}
```

#### Usage:

```tsx
<SmartSearchBar
  value={searchValue}
  onChange={setSearchValue}
  onSubmit={handleSearch}
  onSuggestionClick={handleSuggestionClick}
  isDarkMode={isDarkMode}
/>
```

---

## Color System Integration

### Status Indicators:

| Element | Color | Meaning |
|---------|-------|---------|
| Weather Icon | Amber (#FBBF24) | Day time |
| Weather Icon | Blue (#3B82F6) | Night time |
| Location Badge | Cyan (#00BFFF) | Parking-related |
| Live Indicator | Green (#4ADE80) | Real-time data |
| Peak Hours | Orange (#FF4500) | High activity |
| AI Recommendations | Purple (#A855F7) | Personalization |

### Profile Button Gradient:

```css
background: linear-gradient(to bottom right, 
  rgba(168, 85, 247, 0.5) 0%,   /* Purple */
  rgba(0, 191, 255, 0.5) 100%   /* Cyan */
);
```

With rotating overlay animation (8s duration).

---

## Personalization Features

### Greeting Logic:

```typescript
const hour = currentTime.getHours();

if (hour < 12)       → "Good morning"
else if (hour < 17)  → "Good afternoon"  
else if (hour < 21)  → "Good evening"
else                 → "Good night"

// With user name from localStorage
"Good morning, Alex"
```

### Context-Aware Taglines:

- **6AM - 12PM:** "Start your day with the perfect parking spot"
- **12PM - 5PM:** "Find venues and activities around you"
- **5PM - 11PM:** "Discover nightlife and entertainment"

### Recent Searches:

Stored in `localStorage` under `bytspot_recent_searches`:

```typescript
// Max 5 recent searches, most recent first
["Coffee shops nearby", "Union Square parking", "Downtown venues"]
```

Auto-saved when user performs a search.

---

## Animation Specifications

### Spring Physics (Consistent Across App):

```typescript
const springConfig = {
  type: "spring",
  stiffness: 320,  // Responsive, snappy
  damping: 30,     // Smooth, not bouncy
  mass: 0.8,       // Lightweight feel
};
```

### Entry Animations:

```typescript
// Status bar
initial: { opacity: 0, y: -10 }
animate: { opacity: 1, y: 0 }
delay: 0ms

// Greeting text
delay: 150ms

// Logo
delay: 200ms, with rotate: -10 → 0

// Brand name
delay: 250ms

// Tagline
delay: 300ms

// Context hint
delay: 500ms
```

### Search Bar Animations:

```typescript
// Main container
initial: { opacity: 0, y: 10 }
animate: { opacity: 1, y: 0 }
delay: 350ms

// Suggestions dropdown
initial: { opacity: 0, y: -10, scale: 0.95 }
animate: { opacity: 1, y: 0, scale: 1 }

// Individual suggestions
Staggered by 30ms (0.03s) each
```

---

## Accessibility Features

### Keyboard Navigation:

- Search input fully keyboard accessible
- Tab through suggestions
- Enter to select suggestion
- Escape to close dropdown

### Screen Reader Support:

```tsx
// Profile button
aria-label="Open profile menu"

// Voice button
aria-label="Voice search"

// Clear button
aria-label="Clear search"
```

### Touch Targets:

All interactive elements meet iOS minimum (44x44px):

```css
.tap-target {
  min-width: 44px;
  min-height: 44px;
}
```

---

## Performance Optimizations

### Scroll Performance:

```typescript
// useTransform for GPU-accelerated animations
const headerOpacity = useTransform(scrollY, [0, 100], [1, 0.95]);
const headerBlur = useTransform(scrollY, [0, 100], [20, 40]);
```

### Debounced Updates:

- Clock updates every 60 seconds (not every second)
- Scroll transforms use RAF (Request Animation Frame)
- Blur effects use CSS `backdrop-filter` (GPU)

### Conditional Rendering:

```typescript
// Only render on home tab
{activeTab === 'home' && <EnhancedHeader />}
```

---

## Integration with App.tsx

### State Management:

```typescript
// Existing states used by header
const [showProfile, setShowProfile] = useState(false);
const [searchValue, setSearchValue] = useState('');
const homeScrollRef = useRef<HTMLDivElement>(null);

// Header handlers
const handleSuggestionClick = (suggestion) => {
  // Route to appropriate tab based on suggestion type
};
```

### Scroll Container Reference:

```tsx
<div 
  ref={homeScrollRef}
  className="absolute inset-0 overflow-y-auto"
  onScroll={handleScroll}
>
  {/* Home content */}
</div>
```

Passed to `EnhancedHeader` for scroll-based animations.

---

## Styling & Design Tokens

### Glassmorphism Effect:

```css
background: rgba(28, 28, 30, 0.85);
backdrop-filter: blur(20px);
-webkit-backdrop-filter: blur(20px);
border: 2px solid rgba(255, 255, 255, 0.3);
```

### Border Radius (iOS Standard):

```css
--radius-md: 12px;   /* Small elements */
--radius-lg: 16px;   /* Cards */
--radius-xl: 20px;   /* Containers */
--radius-capsule: 999px; /* Pills, badges */
```

### Shadow System:

```css
/* Card elevation */
box-shadow: 0 2px 16px rgba(0, 0, 0, 0.24), 
            0 1px 4px rgba(0, 0, 0, 0.16);

/* Hover elevation */
box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32), 
            0 2px 8px rgba(0, 0, 0, 0.24);
```

---

## User Experience Flow

### First-Time User:

1. **Splash Screen** (3s)
   - Brand animation with all colors
   
2. **Landing Page**
   - Simplified header
   - Address input
   
3. **Onboarding** (Consent → Auth → Setup → Preferences)
   - Minimal header
   
4. **Home Screen**
   - **Full Enhanced Header appears**
   - Personalized greeting: "Good morning"
   - No recent searches yet
   - Default trending suggestions

### Returning User:

1. **Splash Screen** (3s)
   
2. **Home Screen** (Direct)
   - Personalized greeting: "Good morning, Alex"
   - Recent searches populated (max 5)
   - AI recommendations count updates
   - Time-based context changes

### Search Flow:

1. User taps search bar
   - Bar scales to 101%
   - Suggestions dropdown slides in
   
2. User types query
   - Live filtering of suggestions
   - Clear button (X) appears
   
3. User selects suggestion
   - Saved to recent searches
   - Navigate to appropriate tab
   - Toast notification confirms
   
4. Or user submits search
   - Intelligent classification
   - Route to Discover/Map tab
   - Recent searches updated

---

## Testing Checklist

### Visual Testing:

- [ ] Status bar displays correctly at all scroll positions
- [ ] Weather icon changes based on time (6AM-8PM = sun, else cloud)
- [ ] Clock updates every minute
- [ ] Profile button gradient animates smoothly
- [ ] Large title scales down when scrolling
- [ ] Search bar scales on focus
- [ ] Suggestions dropdown animates in/out

### Interaction Testing:

- [ ] Profile button opens ProfileSection
- [ ] Voice button shows listening overlay
- [ ] Clear button (X) clears search input
- [ ] Clicking suggestion navigates correctly
- [ ] Recent searches save to localStorage
- [ ] "Clear" button removes recent searches
- [ ] Search submit saves to recent searches

### Personalization Testing:

- [ ] Greeting changes based on time of day
- [ ] User name displays if set in localStorage
- [ ] Context tagline changes (morning/afternoon/evening)
- [ ] Recent searches persist across sessions
- [ ] Trending suggestions always visible

### Accessibility Testing:

- [ ] All tap targets ≥ 44x44px
- [ ] Keyboard navigation works
- [ ] Screen reader announces elements correctly
- [ ] Focus states visible
- [ ] Color contrast meets WCAG AA

### Performance Testing:

- [ ] Scroll animations run at 60fps
- [ ] No jank when typing in search
- [ ] Suggestions dropdown renders quickly (<100ms)
- [ ] Voice overlay animates smoothly
- [ ] Clock updates don't cause re-renders

---

## Future Enhancements

### Potential Features:

1. **Weather Integration:**
   - Real weather API (OpenWeather, WeatherAPI)
   - Temperature updates every 30 minutes
   - Weather-based suggestions (rainy = covered parking)

2. **Smart Notifications:**
   - "2 new spots near you"
   - "Your favorite venue is open"
   - "Peak hours ending soon"

3. **Search Autocomplete:**
   - Real-time query suggestions
   - Predictive text based on history
   - Fuzzy matching for typos

4. **Voice Recognition:**
   - Actual Web Speech API integration
   - Natural language processing
   - Multi-language support

5. **Context-Aware Stats:**
   - "Usually busy now" indicator
   - "10% more spots than yesterday"
   - Personal usage patterns

---

## File Structure

```
/components/
  ├── EnhancedHeader.tsx      # Main header component
  ├── SmartSearchBar.tsx      # Search with suggestions
  ├── BrandLogo.tsx           # Logo component (existing)
  ├── ZoneUserCount.tsx       # Live activity counter (existing)
  └── AnimatedSearchPlaceholder.tsx  # Rotating placeholder (existing)

/App.tsx
  # Integration point - imports and uses both components

/styles/globals.css
  # New utility classes:
  # - .scroll-smooth-ios
  # - .bg-premium-* (cyan, purple, magenta, orange)
  # - .text-gradient-* (cyan, purple, magenta, orange)
  # - .glow-* (cyan, purple, magenta, orange)
```

---

## API Reference

### EnhancedHeader Props:

```typescript
interface EnhancedHeaderProps {
  onProfileClick: () => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}
```

### SmartSearchBar Props:

```typescript
interface SmartSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSuggestionClick: (suggestion: SearchSuggestion) => void;
  isDarkMode: boolean;
}

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'recent' | 'trending' | 'nearby' | 'category';
  icon: React.ReactNode;
  category?: string;
}
```

---

## Best Practices

### Do's:

✅ Use `EnhancedHeader` only on home tab  
✅ Pass scroll container ref for animations  
✅ Save searches to localStorage for persistence  
✅ Classify search queries for smart routing  
✅ Show loading states during voice input  
✅ Use spring physics for all animations  
✅ Test on real devices for scroll performance  

### Don'ts:

❌ Don't render header on other tabs  
❌ Don't update clock every second (performance)  
❌ Don't store sensitive data in recent searches  
❌ Don't block scroll with heavy animations  
❌ Don't change header layout mid-scroll  
❌ Don't use non-spring animations (consistency)  

---

## Related Documentation

- **[BRAND_COLORS.md](./BRAND_COLORS.md)** - Color palette and usage
- **[BRAND_LOGO_GUIDE.md](./BRAND_LOGO_GUIDE.md)** - Logo specifications
- **[iOS-Design-System.md](./guidelines/iOS-Design-System.md)** - Design tokens
- **[CODE_STRUCTURE.md](./CODE_STRUCTURE.md)** - Component architecture

---

**Last Updated:** October 13, 2025  
**Version:** 1.0.0  
**Author:** Bytspot Development Team
