# Bytspot Quick Start Guide

> **Fast reference for developers working on Bytspot**

## 🚀 Getting Started in 60 Seconds

### Project Overview
- **What:** Premium AI-powered parking & urban mobility platform
- **Stack:** React + TypeScript + Tailwind v4 + Motion (Framer Motion)
- **Target:** iOS mobile web app (393px width)
- **Mode:** Dark mode only (OLED optimized)

### File You'll Edit Most
```typescript
/App.tsx                    // Main routing & tab logic
/components/DiscoverSection.tsx   // Swipeable cards
/components/MapSection.tsx        // Interactive map
/styles/globals.css              // Design tokens
```

---

## 📱 Three Apps in One

### 1️⃣ Parker (Customer App)
**Route:** Main app with 5 tabs
```
Home → Discover → Map → Insider → Concierge
```

### 2️⃣ Host (Dashboard)
**Route:** `currentScreen === 'host'`
```
Landing → Onboarding (10 steps) → Dashboard (7 views)
```

### 3️⃣ Valet (Driver App)
**Route:** `currentScreen === 'valet'`
```
Landing → Contract Agreement → Dashboard (4 views)
```

---

## 🎨 Design System Quick Reference

### Colors (Use Tailwind Classes)
```tsx
// Brand gradients
className="bg-gradient-to-r from-cyan-500 to-blue-500"      // Parking
className="bg-gradient-to-r from-purple-500 to-fuchsia-500" // Venues
className="bg-gradient-to-r from-orange-500 to-amber-500"   // Valet
```

### Typography (Use CSS Classes)
```tsx
<h1 className="text-large-title">     // 34px, Semibold
<h2 className="text-title-1">         // 28px, Bold
<h3 className="text-title-2">         // 22px, Semibold
<p className="text-body-ios">         // 17px, Regular
<span className="text-footnote">      // 13px, Regular
```

### Spacing (8pt Grid)
```tsx
className="px-4 py-3"    // 16px horizontal, 12px vertical
className="gap-3"        // 12px gap
className="mb-6"         // 24px margin bottom
```

### Glassmorphism Card
```tsx
<div className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
  {/* Content */}
</div>
```

---

## 🎭 Animation Patterns

### Spring Physics (Standard)
```typescript
const springConfig = {
  type: "spring" as const,
  stiffness: 320,
  damping: 30,
  mass: 0.8,
};
```

### Tap Interaction
```tsx
<motion.button
  whileTap={{ scale: 0.95 }}
  transition={springConfig}
>
  Tap Me
</motion.button>
```

### Page Transition
```tsx
<motion.div
  initial={{ opacity: 0, x: -20 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: 20 }}
  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
>
  {/* Content */}
</motion.div>
```

### Modal Entry
```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Modal content */}
    </motion.div>
  )}
</AnimatePresence>
```

---

## 🧩 Common Patterns

### Creating a New Tab
```typescript
// 1. Add to App.tsx
type Tab = 'home' | 'discover' | 'map' | 'insider' | 'concierge' | 'new-tab';

// 2. Create component
/components/NewTabSection.tsx

// 3. Add to AnimatePresence
{activeTab === 'new-tab' && (
  <motion.div key="new-tab" {...transitionProps}>
    <NewTabSection isDarkMode={isDarkMode} />
  </motion.div>
)}

// 4. Add to BottomNav
<BottomNav tabs={[...existing, 'new-tab']} />
```

### Adding a Setting
```typescript
// 1. Create component
/components/NewSetting.tsx

// 2. Add to ProfileSection
<SettingCard
  icon={<Icon />}
  title="New Setting"
  onClick={() => setShowNewSetting(true)}
/>

// 3. Add modal
<AnimatePresence>
  {showNewSetting && (
    <NewSetting onClose={() => setShowNewSetting(false)} />
  )}
</AnimatePresence>
```

### Toast Notification
```typescript
import { toast } from 'sonner@2.0.3';

toast.success('Success!', {
  description: 'Action completed',
  duration: 2000,
});

toast.error('Error!', {
  description: 'Something went wrong',
  duration: 3000,
});
```

---

## 📦 Import Cheat Sheet

### Icons
```typescript
import { MapPin, Star, Sparkles } from 'lucide-react';
```

### Motion
```typescript
import { motion, AnimatePresence } from 'motion/react';
```

### UI Components (ShadCN)
```typescript
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Dialog } from './components/ui/dialog';
```

### Images
```typescript
import { ImageWithFallback } from './components/figma/ImageWithFallback';
```

### Utilities
```typescript
import { classifySearchQuery } from './utils/searchClassifier';
import { getPersonalizedCategories } from './utils/personalization';
```

---

## 💾 localStorage Keys

```typescript
// Authentication
'bytspot_auth_token'
'bytspot_onboarding_complete'

// User Data  
'bytspot_preferences'
'bytspot_behavior_data'
'bytspot_user_profile'

// App State
'bytspot_host_profile'
'bytspot_valet_profile'
```

---

## 🎯 Common Tasks

### Add New Quick Action Card
```tsx
// In App.tsx home tab
<QuickActionCard
  delay={0.45}
  icon={<Icon className="w-[22px] h-[22px]" strokeWidth={2.5} />}
  title="Title"
  subtitle="Subtitle"
  color="purple" // cyan | purple | orange | green
  isDarkMode={isDarkMode}
  onClick={() => {
    // Action
  }}
/>
```

### Add Discover Card Type
```typescript
// 1. Add to type
type CardType = 'parking' | 'venue' | 'valet' | 'new-type';

// 2. Add sample cards
const sampleCards: DiscoverCard[] = [
  {
    id: X,
    type: 'new-type',
    name: 'Name',
    image: 'url',
    // ... other fields
  },
];

// 3. Add color mapping
const getTypeColor = (type: CardType) => {
  switch (type) {
    case 'new-type': return 'from-green-500 to-emerald-500';
    // ...
  }
};
```

### Add Map Function
```typescript
// In MapMenuSlideUp.tsx
export type MapFunction = 
  | 'navigate'
  | 'parking'
  | 'valet'
  | 'new-function';

// Add to menu items
const functions = [
  {
    id: 'new-function',
    icon: <Icon />,
    title: 'New Function',
    description: 'Description',
  },
];
```

---

## 🐛 Debugging Tips

### Component Not Rendering?
```typescript
// Check:
1. Is it in AnimatePresence?
2. Is the key prop correct?
3. Is the condition true?
4. Check console for errors
```

### Animation Not Working?
```typescript
// Check:
1. Using motion.div not div?
2. transition prop included?
3. AnimatePresence wrapping?
4. Check for CSS conflicts
```

### State Not Updating?
```typescript
// Check:
1. Using setState correctly?
2. Not mutating state directly?
3. useEffect dependencies?
4. localStorage sync?
```

### Bottom Nav Auto-Hide Issues?
```typescript
// Check activeTab-specific logic in App.tsx:
- Discover: Hidden by default, show on touch
- Concierge: Always visible (for chat input)
- Others: Scroll-based show/hide
```

---

## 📱 Mobile Testing

### Test URL in Browser
```
http://localhost:5173  (or your dev server)
```

### Chrome DevTools
```
F12 → Toggle Device Toolbar → iPhone 14 Pro (393 x 852)
```

### Safari Responsive Mode
```
Develop → Enter Responsive Design Mode → 393 x 852
```

---

## 🎨 Color Reference

### Brand Colors
```
Cyan:      #00BFFF (Parking)
Magenta:   #FF00FF (Venues)  
Orange:    #FF4500 (Premium)
Purple:    #A855F7 (AI/Personalized)
Pink:      #D946EF (Accent)
```

### Status Colors
```
Green:     Available, Success
Yellow:    Warning, Low availability
Orange:    Limited, Caution
Red:       Error, Full
```

---

## 🚀 Performance Tips

### Images
```tsx
// Always use Unsplash tool for new images
// Or use ImageWithFallback for existing

<ImageWithFallback
  src="url"
  alt="description"
  className="w-full h-full object-cover"
/>
```

### Lists
```tsx
// Always add key prop
{items.map((item) => (
  <div key={item.id}>  {/* ✅ Good */}
    {item.name}
  </div>
))}
```

### Animations
```tsx
// Use transform/opacity only (GPU accelerated)
animate={{ x: 100, opacity: 1 }}  // ✅ Good
animate={{ width: 100 }}           // ❌ Avoid (causes layout)
```

---

## 📝 Component Template

```tsx
import { motion } from 'motion/react';
import { Icon } from 'lucide-react';
import { useState } from 'react';

interface MyComponentProps {
  isDarkMode: boolean;
  onAction?: () => void;
}

export function MyComponent({ isDarkMode, onAction }: MyComponentProps) {
  const [state, setState] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  return (
    <motion.div
      className="p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={springConfig}
    >
      {/* Content */}
    </motion.div>
  );
}
```

---

## 🔗 Related Documentation

- **CODE_STRUCTURE.md** - Full architecture documentation
- **CLEANUP_REPORT.md** - Code quality assessment
- **IMPLEMENTATION_SUMMARY.md** - Feature documentation
- **LEGAL_COMPLIANCE.md** - Legal requirements
- **iOS-Design-System.md** - Design guidelines

---

## 💡 Pro Tips

1. **Use CSS Variables** - Don't hardcode colors/sizes
2. **Follow 8pt Grid** - Use multiples of 4 for spacing
3. **44px Tap Targets** - iOS minimum for touch targets
4. **Spring Animations** - Use consistent spring config
5. **Dark Mode First** - Design for OLED displays
6. **Mobile First** - Test at 393px width
7. **Component Composition** - Keep components small
8. **TypeScript Strict** - Type everything properly

---

**Last Updated:** October 10, 2025  
**Quick Reference Version:** 1.0  
**Next Review:** As needed

---

## 🆘 Need Help?

**Check First:**
1. Search code for similar patterns
2. Check documentation files
3. Review existing components

**Common Solutions:**
- Modal not showing? → Add to AnimatePresence
- Animation broken? → Check motion.div usage
- Style not applying? → Check Tailwind class name
- State not persisting? → Check localStorage

**Remember:** The codebase is consistent - if you've done it once, the pattern works everywhere!
