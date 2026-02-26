# Bytspot Brand Logo Usage Guide

## Overview

The Bytspot logo system consists of two main components that can be used throughout the application:

1. **BrandLogo** - Icon only (symbol mark)
2. **BrandLogotype** - Icon + "BYTSPOT" wordmark

---

## Components

### `BrandLogo`

**Description:** The standalone Bytspot icon featuring concentric rings, hexagon, and location pin.

**Props:**
- `size?: number` - Logo size in pixels (default: `120`)
- `animated?: boolean` - Enable spring animation on mount (default: `false`)
- `className?: string` - Additional CSS classes

**Usage:**

```tsx
import { BrandLogo } from './components/BrandLogo';

// Basic usage
<BrandLogo size={120} />

// Animated version
<BrandLogo size={160} animated={true} />

// Small icon
<BrandLogo size={40} />
```

**When to use:**
- Splash screens
- Landing pages
- Hero sections
- Profile avatars
- Icon-only spaces where the brand is already established

---

### `BrandLogotype`

**Description:** Full logo with icon + "BYTSPOT" wordmark in brand gradient.

**Props:**
- `size?: "small" | "medium" | "large"` - Preset sizes (default: `"large"`)
  - `small`: 24px wordmark, 24px icon
  - `medium`: 40px wordmark, 40px icon
  - `large`: 60px wordmark, 60px icon
- `animated?: boolean` - Enable spring animation on mount (default: `false`)
- `className?: string` - Additional CSS classes

**Usage:**

```tsx
import { BrandLogotype } from './components/BrandLogo';

// Large version (hero)
<BrandLogotype size="large" animated={true} />

// Medium version (headers)
<BrandLogotype size="medium" />

// Small version (compact headers, footers)
<BrandLogotype size="small" />
```

**When to use:**
- App headers with sufficient space
- Marketing materials
- First-time user experiences
- Email templates
- External communications

---

## Logo Design Elements

### Visual Components:

1. **Outer Glow Ring** - Soft brand gradient (cyan → magenta → orange, 30% opacity)
2. **Main Location Ring** - Bold brand gradient (cyan → magenta → orange)
3. **Pulse Ring** - Brand gradient (cyan → magenta → orange, 50% opacity)
4. **Hexagon** - Brand gradient fill (cyan → magenta → orange, represents "byte")
5. **Grid Lines** - Cyan (#00BFFF), magenta (#FF00FF), and orange (#FF4500) lines (40% opacity, represents digital/data)
6. **Location Pin Dot** - Cyan (#00BFFF) dot with glow (represents "spot")

### Color System:

**Brand Colors** (matching `text-brand-gradient` from `globals.css`):
- **Brand Blue (Cyan):** `#00BFFF` - Technology, location, precision
- **Brand Magenta:** `#FF00FF` - Vibrant, modern, energy
- **Brand Orange:** `#FF4500` - Action, warmth, innovation

**All gradients use the same brand gradient:**
```
linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%)
```

This creates a consistent cyan → magenta → orange progression that matches the wordmark exactly.

### Gradient Definitions:

All gradients are defined within the SVG `<defs>` and use the brand color system:
- `gradient-outer` - Outer ring (cyan → magenta → orange)
- `gradient-main` - Main ring (cyan → magenta → orange)
- `gradient-hex` - Hexagon fill (cyan → magenta → orange)
- `gradient-pulse` - Pulse ring (cyan → magenta → orange)

---

## Implementation Examples

### Splash Screen

```tsx
<BrandLogo size={160} animated={true} />

<h1 className="text-[48px] text-brand-gradient mt-8">
  Bytspot
</h1>
```

**Size:** 160px  
**Animation:** Yes  
**Context:** App launch, full attention

---

### Landing Page

```tsx
<BrandLogo size={120} animated={true} />

<h1 className="text-large-title text-brand-gradient">
  Bytspot
</h1>
```

**Size:** 120px  
**Animation:** Yes  
**Context:** First-time user, onboarding

---

### Home Tab Header

```tsx
<BrandLogo size={50} />

<h1 className="text-large-title text-brand-gradient">
  Bytspot
</h1>
```

**Size:** 50px  
**Animation:** No (avoid animation fatigue)  
**Context:** Persistent header, returning users

---

### Host Landing

```tsx
<BrandLogo size={100} animated={true} />

<h1 className="text-large-title text-white">
  Become a Bytspot Host
</h1>
```

**Size:** 100px  
**Animation:** Yes  
**Context:** Sub-app entry point, transitions

---

## Size Guidelines

| Use Case | Recommended Size | Animation |
|----------|-----------------|-----------|
| Splash Screen | 160px - 200px | ✅ Yes |
| Landing Page | 100px - 140px | ✅ Yes |
| Hero Section | 80px - 120px | ✅ Yes |
| Page Header | 40px - 60px | ❌ No |
| Navigation | 32px - 40px | ❌ No |
| Avatar/Profile | 24px - 32px | ❌ No |
| Favicon | 16px - 32px | ❌ No |

---

## Accessibility

### Contrast

The logo uses high-contrast gradients optimized for both light and dark modes:
- **Dark mode:** Bright gradients (cyan, purple, magenta) pop against black
- **Light mode:** Use the logo sparingly or with sufficient spacing

### Motion

The `animated` prop triggers a spring-based scale/opacity animation:
- **Duration:** ~600ms
- **Easing:** Spring physics (stiffness: 320, damping: 30, mass: 0.8)
- **Use sparingly:** Only on entry points to avoid animation fatigue

### Screen Readers

The logo is purely decorative. Ensure surrounding text provides context:

```tsx
<BrandLogo size={120} />
<h1 aria-label="Bytspot - Your perfect parking spot">
  Bytspot
</h1>
```

---

## Don'ts

❌ **Don't** stretch or distort the logo  
❌ **Don't** change the gradient colors  
❌ **Don't** add drop shadows or additional effects  
❌ **Don't** use animation on persistent UI elements  
❌ **Don't** place on busy backgrounds without contrast  
❌ **Don't** use sizes smaller than 24px (details become unclear)  
❌ **Don't** combine BrandLogo and BrandLogotype together

---

## File Structure

```
/components/
  BrandLogo.tsx       // Both BrandLogo and BrandLogotype components
```

**Imports:**

```tsx
// Import icon only
import { BrandLogo } from './components/BrandLogo';

// Import full logotype
import { BrandLogotype } from './components/BrandLogo';

// Import both
import { BrandLogo, BrandLogotype } from './components/BrandLogo';
```

---

## Current Usage Locations

✅ **SplashScreen.tsx** - `<BrandLogo size={160} animated={true} />`  
✅ **LandingPage.tsx** - `<BrandLogo size={120} animated={true} />`  
✅ **App.tsx** (Home Tab) - `<BrandLogo size={50} />`  
✅ **HostLanding.tsx** - `<BrandLogo size={100} animated={true} />`

---

## Future Considerations

### Static Assets

For email templates, documentation, or external use, export static versions:

```bash
# Export as PNG (various sizes)
- bytspot-logo-16.png
- bytspot-logo-32.png
- bytspot-logo-64.png
- bytspot-logo-128.png
- bytspot-logo-256.png
- bytspot-logo-512.png

# Export as SVG
- bytspot-logo.svg
- bytspot-logotype.svg
```

### App Store Assets

- **App Icon:** Use `BrandLogo` design at 1024x1024px
- **Marketing:** Use `BrandLogotype` for screenshots, banners
- **Loading Screens:** Use animated `BrandLogo` 

---

## Questions?

For brand guidelines, color usage, or logo modifications, refer to:
- `/guidelines/iOS-Design-System.md` - Design system tokens
- `/styles/globals.css` - Brand color variables
- `/BRAND_LOGO_GUIDE.md` - This guide

---

**Last Updated:** October 12, 2025  
**Version:** 1.0.0  
**Maintained by:** Bytspot Design Team
