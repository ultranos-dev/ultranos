# Design Specification: eHealth PMR Healthcare Solution

## 1. Core Design Principles
* **Mobile-First & Fluid:** The interface is optimized for one-handed mobile use, utilizing large touch targets, swipeable cards, and bottom-anchored navigation, seamlessly scaling to complex dashboard layouts for tablet and desktop.
* **High Contrast & Modern:** Relies on a stark black-and-white base juxtaposed with an energetic, highly saturated lime-green accent color to draw attention to primary actions and key data.
* **Organic & Approachable:** Moving away from rigid, clinical healthcare designs, it incorporates organic, wavy borders on cards and heavily rounded geometry (pill shapes, full circles) to feel friendly and modern.

---

## 2. Color Palette

### Primary Colors
* **Brand Lime:** `#D4FF00` (Approx.) - Used for primary call-to-actions, active states, key data highlights, and prominent UI cards. 
* **Deep Black:** `#000000` - Used for heavy typography, dark mode surface cards, and primary text.
* **Pure White:** `#FFFFFF` - Used for app backgrounds, primary surface cards, and negative text.

### Secondary / Neutral Colors
* **Surface Gray:** `#F3F4F6` - Used for secondary backgrounds, inactive tab bars, and map interface backgrounds.
* **Border/Line Gray:** `#E5E7EB` - Used for subtle dividers and inactive progress bar ticks.
* **Text Gray (Muted):** `#6B7280` - Used for secondary information, sub-labels, and timestamps.
* **Success Green:** `#A3E635` - Used sparingly for status indicators (e.g., "Accepting New Patients" checkmark).

---

## 3. Typography

**Font Family:** A clean, modern Neo-Grotesque sans-serif (e.g., *Inter, SF Pro Display, or Roobert*).

* **Display/Hero (`h1`):** * Weight: Bold / 700
  * Size: 48px - 64px (Desktop) / 36px - 42px (Mobile)
  * Tracking: Tight (`-0.02em`)
  * Example: "Experience the future", "About Work"
* **Section Titles (`h2`):** * Weight: Semi-Bold / 600
  * Size: 24px - 28px
  * Example: "Your Claims", "Health Spending Account"
* **Card Titles (`h3`):** * Weight: Medium / 500
  * Size: 18px - 20px
  * Example: Doctor names ("Belinda Pham MD")
* **Body Text (`p`):**
  * Weight: Regular / 400
  * Size: 14px - 16px
  * Leading (Line-height): 1.5
* **Micro-copy & Tags:**
  * Weight: Medium / 500
  * Size: 10px - 12px
  * Example: "In-Network", "Approved", "Swipe to next"

*Note: A signature typographic detail is the use of small, black, squiggly/wavy lines `〰` beneath primary titles (like the Doctor's name or section headers) as a decorative divider.*

---

## 4. UI Components

### 4.1. Cards
* **Standard Cards:** * Corner Radius: `24px` to `32px`.
  * Shadows: Very soft, diffuse drop shadows only on floating elements (like map pins or active swipe cards). Most flat cards rely on background color contrast (White on Gray, or Lime on White).
* **Organic/Wavy Cards (Signature Element):**
  * Certain horizontal data cards (e.g., the "Doctor's visit $120" breakdown) feature custom wavy/concave borders on the top and bottom edges rather than straight lines. This requires custom SVG wrappers or complex CSS `clip-path` masks.
* **Color Variants:**
  * Dark Mode Card: Black background, white text.
  * Highlight Card: Brand Lime background, black text.
  * Standard Card: White background, black text.

### 4.2. Buttons & Navigation
* **Primary Actions:** Pill-shaped (`border-radius: 9999px`). Example: `[Search icon] Family Medicine` floating over the map.
* **Icon Buttons:** Perfect circles (`width: 48px`, `height: 48px`, `border-radius: 50%`). 
  * Default state: White or Gray background, thin stroke icon.
  * Active state (Bottom Nav): Black circular background, white icon.
* **Bottom Navigation (Mobile):** * A floating, pill-shaped translucent or solid white dock at the bottom of the screen containing equidistant circular icons. 

### 4.3. Status Tags & Badges
* Pill-shaped (`border-radius: 12px`).
* **Approved/In-Progress:** Gray background, black text.
* **In-Network:** Dark gray/black background, white text.
* **Checkmark Badge:** Small lime green circle with a black checkmark used to denote verified status or "Accepting New Patients".

### 4.4. Data Visualization (The "Barcode" Chart)
* **Health Spending Account Chart:** Instead of traditional pie charts or solid progress bars, the UI uses a stylized "barcode" or "equalizer" design.
* **Structure:** A horizontal row of vertical, rounded lines/ticks.
* **Active/Spent:** Solid, darker lines.
* **Available/Remaining:** Dotted, lighter lines or faded ticks.
* *Note:* This requires a custom flexbox layout mapping an array of `<div>` lines or an SVG component.

---

## 5. Layout & Grid

### 5.1. Mobile Structure (Default)
* **Header:** Minimal. Often just a profile picture, a back button (circular), or a logo.
* **Body:** Vertical scrolling list of heavily rounded cards. Margins are generous (`16px` to `24px` padding on the main container).
* **Map View:** Full-bleed background map. UI elements (search bars, doctor profile snippets) float above the map as absolute-positioned, z-indexed overlays.

### 5.2. Desktop/Tablet Structure (Extended)
* **Multi-Column Dashboard:** As seen in the mockups, the tablet/desktop view breaks out into a multi-pane layout.
  * **Left Pane (Sticky):** Personal dashboard (Profile, Spending Account chart, Recent Claims).
  * **Center Pane (Fluid):** Interactive Map view with location pins.
  * **Right Pane (Scrollable):** Contextual side-panel (Doctor profile details, booking interface, cost breakdowns).

---

## 6. Iconography & Imagery
* **Icons:** Line-art style, typically 1.5px to 2px stroke width. Unfilled. Clean and minimal (e.g., standard map pins, simple user silhouettes, tooth for dental, stethoscope for services).
* **Avatars/Photos:** * High-quality, brightly lit studio photography for doctors.
  * Frequently isolated from their background (transparent PNGs) and layered directly onto the UI surface (like the grey and lime green backgrounds), allowing the subject to "break the frame" of the card slightly for a 3D effect.
  * User profile pictures are contained in standard circular masks.

---

## 7. Interactive & Animation Guidelines (Inferred)
* **Swipe Gestures:** Explicitly indicated by "Swipe to next ->" text and horizontal arrows. Cards in the map view operate on a horizontal snap-scroll or carousel (`scroll-snap-type: x mandatory`).
* **Transitions:** Smooth, spring-based animations for opening the bottom drawer panels or expanding doctor details.
* **Hover States (Web):** Lime green elements slightly darken or scale up by `1.02x` on hover to indicate interactivity.