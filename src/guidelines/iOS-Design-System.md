# Bytspot iOS Design System
## Engineering Implementation Guide

This document serves as the complete design specification for 1:1 engineering implementation following iOS/SwiftUI principles.

---

## 📐 Design Foundations

### Device Specifications
- **Primary Device**: iPhone 15 Pro
- **Screen Size**: 393 × 852 px
- **Safe Area**: 16px horizontal padding
- **Min Tap Target**: 44 × 44 px

### Spacing System (8pt Rhythm)
- **Base Unit**: 8px
- **Spacing Scale**:
  - `--spacing-1`: 8px
  - `--spacing-2`: 16px (standard horizontal padding)
  - `--spacing-3`: 24px
  - `--spacing-4`: 32px
  - `--spacing-5`: 40px
  - `--spacing-6`: 48px

---

## 🎨 Color Tokens

### Brand Colors
```css
--brand-blue: #00BFFF      /* Primary brand - Sky blue */
--brand-magenta: #FF00FF   /* Secondary brand - Vibrant magenta */
--brand-orange: #FF4500    /* Tertiary brand - Orange red */
```

### Accent Colors
```css
--accent-purple: #A855F7   /* Purple accent for UI elements */
--accent-pink: #D946EF     /* Pink accent for highlights */
```

### Surface Colors (Dark Mode)
```css
--surface-glass: rgba(255, 255, 255, 0.06)  /* Glass background */
--border-glass: rgba(255, 255, 255, 0.15)   /* Glass border */
--text-primary: rgba(255, 255, 255, 0.95)   /* Primary text */
--text-secondary: rgba(255, 255, 255, 0.70) /* Secondary text */
--bg-app: #0B0B10                           /* App background */
```

### Surface Colors (Light Mode)
```css
--surface-glass: rgba(255, 255, 255, 0.80)  /* Glass background */
--border-glass: rgba(0, 0, 0, 0.12)         /* Glass border */
--text-primary: rgba(0, 0, 0, 0.95)         /* Primary text */
--text-secondary: rgba(0, 0, 0, 0.65)       /* Secondary text */
--bg-app: #F5F5F7                           /* App background */
```

### Brand Gradient (Wordmark)
```css
background: linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%);
```

---

## 📝 Typography Scale (SF Pro Text/Display)

### Text Styles
| Style | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| **Large Title** | 34px | 41px | Semibold (600) | Main screen titles |
| **Title 1** | 28px | 34px | Bold (700) | Section headers |
| **Title 2** | 22px | 28px | Semibold (600) | Subsection headers |
| **Title 3** | 20px | 25px | Semibold (600) | Card titles |
| **Headline** | 17px | 22px | Semibold (600) | Prominent labels |
| **Body** | 17px | 22px | Regular (400) | Body text |
| **Callout** | 16px | 21px | Regular (400) | Emphasized body |
| **Subhead** | 15px | 20px | Regular (400) | List items |
| **Footnote** | 13px | 18px | Regular (400) | Captions, subtitles |
| **Caption 1** | 12px | 16px | Regular (400) | Small labels |
| **Caption 2** | 11px | 13px | Regular (400) | Tab bar labels |

### Font Weights
- **Regular**: 400
- **Medium**: 500
- **Semibold**: 600
- **Bold**: 700

### Letter Spacing
- Large Title: `-0.02em`
- Title 1, Title 2: `-0.01em`
- Others: Default

---

## 🔄 Motion & Animation

### iOS Spring Physics
```typescript
{
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.8
}
```

### Animation Timings
| Interaction | Duration | Easing | Notes |
|-------------|----------|--------|-------|
| **Large Title Collapse** | 240-320ms | Spring | Scale 1 → 0.92, opacity 1 → 0, y 0 → -10 |
| **Compact Nav Appear** | 240-320ms | Spring | Opacity 0 → 1, y -10 → 0 |
| **Card Hover** | 180ms | ease-out | Scale 1 → 1.01, translateY 0 → -4px |
| **Button Press** | 150ms | Spring | Scale 1 → 0.95 |
| **Mic Pulse** | 1000ms | Loop | Subtle ring opacity/scale animation |
| **Tab Transition** | 300ms | Spring | layoutId animation |

### Reduced Motion
Provide simplified animation variants for accessibility when `prefers-reduced-motion` is enabled.

---

## 🔘 Border Radius

### Radius Scale
```css
--radius-sm: 8px       /* Small elements */
--radius-md: 12px      /* Standard cards, inputs */
--radius-lg: 16px      /* Large cards, panels */
--radius-xl: 20px      /* Action cards */
--radius-2xl: 22px     /* Hero elements */
--radius-capsule: 999px /* Pills, search bar */
```

### Usage
- **Search Bar**: Capsule (999px)
- **Quick Action Cards**: 20px
- **Nearby Cards**: 16px
- **Tab Bar**: 24px
- **Icon Containers**: 12px

---

## ✨ Effects & Shadows

### Glassmorphism
```css
.glass-surface {
  background: var(--surface-glass);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid var(--border-glass);
}
```

### Blur Levels
- **Small**: 12px (subtle elements)
- **Large**: 18px (primary surfaces)

### Shadows
```css
--shadow-card: 0 12px 40px rgba(168, 85, 247, 0.15);
```

Apply to:
- Hovered cards
- Elevated surfaces
- Action buttons

---

## 🧩 Component Specifications

### NavBar (Large Title)
- **Title**: 34px, Semibold, Brand Gradient
- **Subtitle**: 17px, Regular, Secondary Color
- **Padding**: 16px horizontal, 16px vertical
- **Behavior**: Scales and fades on scroll

### NavBar (Compact)
- **Title**: 17px, Semibold, Brand Gradient
- **Height**: 44px
- **Appears**: When scrolled past 60px threshold

### Search Bar (Capsule)
- **Border Radius**: Capsule (999px)
- **Padding**: 16px horizontal, 10px vertical
- **Left Icon**: Search, 15px
- **Right Button**: Mic, 44px tap target
- **States**: Default, Typing, Listening (pulse)

### Quick Action Card
- **Size**: Min 44px tap target
- **Border Radius**: 20px
- **Padding**: 20px
- **Icon Container**: 44px × 44px, 12px radius
- **States**: Default, Hover (scale 1.01, lift -4px), Pressed (scale 0.95)

### Footer Tab Bar
- **Height**: Auto (with 32px bottom padding)
- **Border Radius**: 24px
- **Margin**: 16px horizontal
- **Tab Items**: 5 items, 44px tap target each
- **Active State**: Background pill with layout animation
- **Icons**: 24px, stroke width 2 (inactive) / 2.5 (active)
- **Labels**: Caption 2 (11px), Regular (inactive) / Semibold (active)

### Featured Card
- **Border Radius**: 16px
- **Image**: Top 55% of card
- **Gradient Overlay**: Bottom to top, transparent to black/60-80%
- **Padding**: 16px

---

## 📱 Screen Layouts

### 01. Discover (Home)
```
┌─────────────────────────────────┐
│ Status Bar (48px)               │
├─────────────────────────────────┤
│ Header (Weather + Theme Toggle) │
│ (Padding: 16px)                 │
├─────────────────────────────────┤
│ Large Title "Bytspot"           │
│ Gradient: Blue→Magenta→Orange   │
│ Subtitle: "Your perfect spot    │
│           awaits"               │
│ (Padding: 16px, 16px top/btm)   │
├─────────────────────────────────┤
│ Search Bar (Capsule)            │
│ With rotating placeholders      │
│ + Mic button (44px)             │
│ (Padding: 16px)                 │
├─────────────────────────────────┤
│ Quick Actions Grid (2×2)        │
│ - Find Parking (Cyan)           │
│ - Valet Service (Purple)        │
│ - Venues (Orange)               │
│ - Navigate (Green)              │
│ (Gap: 12px, Padding: 16px)      │
├─────────────────────────────────┤
│ Nearby Section                  │
│ - Downtown Plaza                │
│ - Central Station               │
│ - Bay Area Mall                 │
│ (List cards, 12px gap)          │
├─────────────────────────────────┤
│ Footer Tab Bar                  │
│ Discover | Map | Activity |     │
│ Concierge | Profile             │
│ (Bottom: 32px padding)          │
└─────────────────────────────────┘
```

### Scroll Behavior
- **0-60px**: Large Title visible
- **60px+**: Large Title → Compact Nav transition
  - Large title: opacity 1 → 0, scale 1 → 0.92, y 0 → -10
  - Compact title: opacity 0 → 1, y -10 → 0
  - Duration: 240-320ms, iOS spring

---

## ♿ Accessibility

### Requirements
- **Min Tap Target**: 44 × 44 px on all interactive elements
- **Contrast Ratio**: 
  - Text Primary: 4.5:1 minimum
  - Text Secondary: 3:1 minimum
- **Reduced Motion**: Provide alternative animations
- **Semantic Labels**: Meaningful ARIA labels on all buttons
- **Focus States**: Visible focus indicators

### Implementation
```tsx
// All buttons get tap-target class
className="tap-target"

// Provides min-width and min-height of 44px
```

---

## 🎭 Dark Mode / Light Mode

### Transition
- **Duration**: 500ms
- **Easing**: ease-in-out
- **Properties**: background-color, color, border-color

### Background Gradients
**Dark Mode:**
- Base: `#0B0B10`
- Radial overlays: Purple/15% + Blue/12%

**Light Mode:**
- Base: `#F5F5F7`
- Radial overlays: Purple/8% + Blue/6%

---

## 🧪 States & Variants

### Button States
1. **Default**: Base appearance
2. **Hover**: Scale 1.01, translateY -4px (180ms)
3. **Pressed**: Scale 0.95 (iOS spring)
4. **Disabled**: opacity 0.5, pointer-events none
5. **Focus**: Ring outline (accessibility)

### Input States
1. **Default**: Placeholder visible
2. **Focused**: Scale 1.005, placeholder fades
3. **Typing**: Active state
4. **Listening**: Pulse animation on mic (1s loop)

### Card States
1. **Default**: Base appearance
2. **Hover**: Lift animation, shadow increase
3. **Pressed**: Scale 0.98
4. **Selected**: Border color change

---

## 📦 File Organization

```
/components
  /ui (shadcn components)
  AnimatedSearchPlaceholder.tsx
  BottomNav.tsx
  QuickActionCard.tsx
  SplashScreen.tsx

/styles
  globals.css (Design tokens & utilities)

/guidelines
  iOS-Design-System.md (This file)

App.tsx (Main entrypoint)
```

---

## 🔧 Developer Notes

### CSS Variables
All design tokens are available as CSS variables:
```css
var(--brand-blue)
var(--text-large-title)
var(--spacing-2)
var(--radius-lg)
var(--spring-stiffness)
```

### Utility Classes
```css
.text-brand-gradient    /* Brand gradient text */
.glass-surface          /* Glassmorphism effect */
.tap-target            /* 44px min tap target */
.text-large-title      /* iOS Large Title style */
.text-title-2          /* iOS Title 2 style */
.text-footnote         /* iOS Footnote style */
```

### Motion Implementation
```typescript
import { motion } from 'motion/react';

const springConfig = {
  type: "spring",
  stiffness: 320,
  damping: 30,
  mass: 0.8,
};

<motion.div
  whileTap={{ scale: 0.95 }}
  transition={springConfig}
>
```

---

## 📋 Handoff Checklist

- [ ] Design tokens defined in CSS variables
- [ ] Typography scale implemented with SF Pro
- [ ] Brand gradient applied to "Bytspot" wordmark
- [ ] 8pt rhythm spacing throughout
- [ ] 44px minimum tap targets on all interactive elements
- [ ] iOS spring physics (320/30/0.8) on all animations
- [ ] Glassmorphism surfaces with 18px blur
- [ ] Border radius values (12, 16, 20, 22, capsule)
- [ ] Dark mode and light mode variants
- [ ] Reduced motion alternatives
- [ ] Accessibility labels and ARIA attributes
- [ ] Component variants (default, hover, pressed, disabled)
- [ ] Large Title → Compact Nav scroll behavior
- [ ] Tab bar with layout animations
- [ ] Mic pulse animation
- [ ] Search placeholder rotation

---

## 📸 Export Assets

### Icons (SF Symbols equivalent)
- Search, Mic, Map, Compass, Sparkles, Star, Navigation, User, MessageCircle
- Format: SVG
- Stroke width: 2.5 (active), 2 (inactive)

### Images
- Format: PNG @3x for Retina displays
- Compression: Optimized for web

### Naming Convention
- Use kebab-case: `icon-name.svg`
- No spaces in file names
- Semantic naming for developer handoff

---

## 🎨 Figma Dev Mode

When preparing Figma files for handoff:

1. **Enable Dev Mode** for engineering team
2. **Set Constraints**: Hug/Fixed appropriately
3. **Semantic Naming**: 
   - Nav/Title/Large
   - Tab/Item/Active
   - Card/QuickAction/Default
4. **Redlines**: Annotate spring constants and special behaviors
5. **Components**: Create variants for all states
6. **Auto Layout**: Use everywhere for responsive behavior
7. **Tokens Plugin**: Export color/spacing/typography tokens if using Tokens Studio

---

**Document Version**: 1.0  
**Last Updated**: October 5, 2025  
**Maintained By**: Bytspot Design Team
