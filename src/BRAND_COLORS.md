# Bytspot Brand Colors Reference

## Primary Brand Gradient

The Bytspot brand uses a consistent 3-color gradient system across all brand touchpoints:

```css
linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%)
```

### Color Breakdown

| Color | Hex Code | RGB | Position | Meaning |
|-------|----------|-----|----------|---------|
| **Cyan** | `#00BFFF` | `rgb(0, 191, 255)` | 0% | Technology, Location, Precision |
| **Magenta** | `#FF00FF` | `rgb(255, 0, 255)` | 50% | Energy, Innovation, Premium |
| **Orange** | `#FF4500` | `rgb(255, 69, 0)` | 100% | Action, Warmth, Urban |

---

## Usage in Components

### 1. Text Gradient (Wordmark)

```tsx
<h1 className="text-brand-gradient">
  Bytspot
</h1>
```

**CSS Class:**
```css
.text-brand-gradient {
  background: linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

### 2. Logo Gradients

The `<BrandLogo>` component uses the same gradient for all elements:

```tsx
<BrandLogo size={120} animated={true} />
```

**SVG Gradients:**
```xml
<linearGradient id="gradient-main">
  <stop offset="0%" stopColor="#00BFFF" />   <!-- Cyan -->
  <stop offset="50%" stopColor="#FF00FF" />  <!-- Magenta -->
  <stop offset="100%" stopColor="#FF4500" /> <!-- Orange -->
</linearGradient>
```

Applied to:
- Outer glow ring (30% opacity)
- Main location ring (100% opacity)
- Pulse ring (50% opacity)
- Hexagon fill (90% opacity)

---

### 3. Background Gradient

```tsx
<div className="bg-brand-gradient">
  <!-- Content -->
</div>
```

**CSS Class:**
```css
.bg-brand-gradient {
  background: linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%);
}
```

---

## Secondary Colors (Accents)

These colors complement the brand gradient but are NOT part of the primary brand identity:

| Color | Hex Code | Usage |
|-------|----------|-------|
| Accent Purple | `#A855F7` | UI highlights, chips, badges |
| Accent Pink | `#D946EF` | Secondary CTAs, notifications |

---

## Color Psychology

### Cyan (#00BFFF) - "Digital Precision"
- Represents technology and digital infrastructure
- Evokes trust and reliability
- Associated with location services and GPS
- Cool, calming, professional

### Magenta (#FF00FF) - "Urban Energy"
- Represents innovation and forward-thinking
- High contrast, attention-grabbing
- Associated with premium experiences
- Bold, modern, vibrant

### Orange (#FF4500) - "Action & Warmth"
- Represents action and human connection
- Encourages engagement and urgency
- Associated with city life and community
- Warm, friendly, approachable

---

## Accessibility

### Contrast Ratios

**Against Black Background (`#000000`):**
- Cyan `#00BFFF`: 8.59:1 (AAA)
- Magenta `#FF00FF`: 6.70:1 (AA)
- Orange `#FF4500`: 5.39:1 (AA)

**Against White Background (`#FFFFFF`):**
- Cyan `#00BFFF`: 2.44:1 (Fail - Use with caution)
- Magenta `#FF00FF`: 3.13:1 (Fail - Use with caution)
- Orange `#FF4500`: 3.89:1 (AA for large text only)

**Recommendation:** Use brand gradient on dark backgrounds (`#000000`, `#1C1C1E`) for optimal contrast and accessibility.

---

## Dark Mode Optimization

The brand gradient is optimized for dark mode (OLED displays):

- **Black Background** (`#000000`): Pure black for OLED energy efficiency
- **Glass Surfaces** (`rgba(28, 28, 30, 0.95)`): Dark with transparency
- **Borders** (`rgba(255, 255, 255, 0.30)`): Subtle white borders

The gradient colors maintain high contrast and vibrancy against these dark surfaces.

---

## Design Tokens (CSS Variables)

From `/styles/globals.css`:

```css
:root {
  --brand-blue: #00BFFF;
  --brand-magenta: #FF00FF;
  --brand-orange: #FF4500;
  --accent-purple: #A855F7;
  --accent-pink: #D946EF;
}
```

**Usage:**
```css
.custom-element {
  border-color: var(--brand-blue);
  background: linear-gradient(
    135deg, 
    var(--brand-blue) 0%, 
    var(--brand-magenta) 50%, 
    var(--brand-orange) 100%
  );
}
```

---

## Dos and Don'ts

### ✅ DO:
- Use the full 3-color gradient for brand elements (logo, wordmark)
- Maintain the exact hex codes for consistency
- Use on dark backgrounds (`#000000`, `#1C1C1E`)
- Preserve the gradient angle (135deg) for consistency

### ❌ DON'T:
- Modify the gradient stops or percentages
- Use only 1 or 2 colors from the gradient (use all 3)
- Change the hex codes or color values
- Use on light backgrounds without sufficient contrast
- Mix with other gradients that don't match the brand

---

## Export for External Use

### For Designers (Figma, Sketch, Adobe XD)

**Linear Gradient:**
- Type: Linear
- Angle: 135°
- Stop 1: `#00BFFF` at 0%
- Stop 2: `#FF00FF` at 50%
- Stop 3: `#FF4500` at 100%

### For Developers (React, CSS, SVG)

**React Inline Style:**
```tsx
style={{
  background: 'linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text'
}}
```

**CSS:**
```css
background: linear-gradient(135deg, #00BFFF 0%, #FF00FF 50%, #FF4500 100%);
```

**SVG:**
```xml
<linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stopColor="#00BFFF" />
  <stop offset="50%" stopColor="#FF00FF" />
  <stop offset="100%" stopColor="#FF4500" />
</linearGradient>
```

---

## Related Documentation

- **Logo Guide:** `/BRAND_LOGO_GUIDE.md`
- **Design System:** `/guidelines/iOS-Design-System.md`
- **Global Styles:** `/styles/globals.css`

---

**Last Updated:** October 12, 2025  
**Version:** 1.0.0  
**Maintained by:** Bytspot Design Team
