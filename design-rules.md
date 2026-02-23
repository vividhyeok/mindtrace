# mindtrace UI Design Rules (MVP)

## 1) Color Tokens
- Primary: #6D28D9 (purple)
- Secondary: #C8F2E2 (mint)  // or pick one and keep fixed
- Background: #FFFAF6 (cream)
- Surface: #FFFFFF
- Text Primary: #504A60
- Text Secondary: #7A748A
- Border: #E9E4F2

Rules:
- Strong accent colors max 2 per screen (Primary + Secondary)
- No random red/green/yellow accents unless semantic state (error/success)
- CTA uses Primary only
- Secondary is for soft backgrounds/chips only

## 2) Typography
- Display: 32-40px, weight 800, line-height 1.15
- H2: 20-24px, weight 700
- Body: 15-17px, weight 400/500, line-height 1.6
- Label/Chip: 12-14px, weight 600

Rules:
- One main headline per page
- Korean readability first
- Avoid awkward line breaks in hero headline (target 2 lines max on mobile)

## 3) Spacing
Use 8px scale:
- 4, 8, 12, 16, 24, 32

Rules:
- Card padding mobile: 20-24px
- Section gap: 24-32px
- Input/button vertical spacing: 12-16px
- Chip gap: 8px

## 4) Radius / Shadow
- Card radius: 24-32px
- Input/button radius: 14-18px
- Shadow: soft only (no harsh black shadow)

Rules:
- No thick black outlines for CTA buttons
- Use subtle border + soft shadow instead

## 5) Components
### Button
- Variants: primary, secondary, ghost
- Height consistent per page
- Primary button = filled primary background + white text

### Input
- Soft surface background
- Visible focus ring (primary)
- Placeholder muted

### Card
- Surface background + soft shadow
- Clear hierarchy between outer card and inner sub-card

### Chip
- Small rounded pill
- Consistent padding and font size
- Can wrap to next line naturally

## 6) Responsive
- Mobile-first
- Keep content max-width constrained on desktop
- Increase whitespace on tablet/desktop, not font sizes too aggressively

## 7) Don’ts
- No random accent colors
- No inconsistent button styles across pages
- No harsh borders/shadows
- No overly tiny gray text
- No long cramped paragraphs