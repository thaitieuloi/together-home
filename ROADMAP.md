# together-home — Feature Roadmap

> Inspired by iSharingOf (60M+ users). All features are **100% free** for all users.
> Monetization strategy is reserved for Sprint 4 design only.

---

## ✅ Sprint 0 — Foundation (Completed)
- [x] Android background location foreground service fix (`AndroidManifest.xml`)
- [x] Improved background permission handling on Android 11+
- [x] Core: Real-time GPS, Leaflet map, Supabase Realtime
- [x] Family groups with invite codes
- [x] Location history trail (3h, 500pts)
- [x] Geofence creation & management
- [x] Family group chat (text + images + location pin)
- [x] SOS alert with push notification
- [x] Live location sharing (time-limited)
- [x] Dark/light theme
- [x] Bilingual VI/EN

---

## 🚀 Sprint 1 — Quick UX Wins (Current)
> All changes are **high impact, low effort**. Zero new backend infrastructure needed.

### 1.1 Member Name Label on Map Marker
- Show member's name in a pill below the avatar circle on the map
- Speed badge above marker when actively moving (> 3 km/h)
- Fixes the #1 UX complaint: "I can't tell who is who on the map"

### 1.2 Battery Level Tracking & Display
- Collect device battery % via `@capacitor/device` (native) + Web Battery API (web)
- Store `battery_level` (0–100) in `latest_locations` table
- Display battery % + color-coded icon in the sidebar member card
  - Green: > 50% | Amber: 20–50% | Red: < 20% (with pulse animation)

### 1.3 Speed Badge on Sidebar
- Show movement speed (km/h) badge next to member name when `is_moving = true`
- Helps family know if member is currently in a vehicle vs. stationary

### 1.4 SOS Button — Countdown + Cancel
- Replace instant confirmation dialog with a **5-second countdown** ring
- Cancel button during countdown prevents accidental SOS sends
- Tap outside or press Cancel → abort immediately
- Visual: pulsing red countdown ring with number display
- After 5s: sends SOS with GPS + haptic feedback (unchanged logic)

### 1.5 Geofence Creation UX — Slider Radius
- Replace raw number input for radius with a visual **range slider** (50m – 5000m)
- Show live label with current value next to slider
- Tap-on-map to set coordinates already works; this polishes the last rough edge

### DB Migration Required
```sql
ALTER TABLE latest_locations
  ADD COLUMN IF NOT EXISTS battery_level SMALLINT DEFAULT NULL;
COMMENT ON COLUMN latest_locations.battery_level IS 'Device battery percentage 0–100';
```

---

## 📋 Sprint 2 — Core Missing Features (3–4 weeks)

### 2.1 Avatar Upload (Real Profile Photos)
- Allow users to upload a real photo as avatar (Supabase Storage bucket)
- Display photo on map markers and sidebar
- Validate MIME type (image/jpeg, image/png, image/webp) + max 5MB

### 2.2 Member Tap → Quick Action Bottom Sheet
- Tapping a member marker or sidebar card opens a bottom sheet with:
  - 📍 Navigate to member (opens Google Maps / Apple Maps)
  - 💬 Message member (jump to chat, filtered)
  - 🗺️ View location history
  - 🔋 Battery + speed info
  - ⏱️ Last seen timestamp

### 2.3 Location History — Time Range & Travel Mode
- Replace hardcoded 3h/500pts with time range picker: 1h / 6h / 24h / 7d
- Add travel mode detection label: 🚶 Walking / 🚗 Driving (based on speed)
- Show speed per trail segment via color gradient (slow=blue, fast=red)
- List view alongside map: chronological stops with timestamps

### 2.4 Geofence Alert History UI
- `geofence_events` table already exists — build the UI
- Tab in Zones panel: "Alert History" showing enter/exit events
- Per-event: member name, zone name, time, enter/exit icon

### 2.5 Geofence Notification Preferences UI
- `geofence_notification_prefs` table already exists — build the UI
- Per geofence toggles: notify on Enter / notify on Exit / per member

### 2.6 Last Known Location Badge
- When member is offline (> 30min), show badge: "Offline · Last seen 2h ago"
- Different marker opacity for offline members (0.6 opacity)

---

## 🌟 Sprint 3 — Advanced Safety Features (4–5 weeks)

### 3.1 Onboarding Flow
- Welcome screen (3 slides: Track / Alert / Chat) with skip option
- Family setup wizard: Create family OR enter invite code
- Permission rationale screen before requesting GPS (explains why)
- Invite via shareable link (deep link) instead of just copy code

### 3.2 Inactivity Alert
- Push notification when a member's phone shows no movement for X hours
- Configurable threshold per member (default: 4 hours)
- Implementation: Supabase Edge Function + pg_cron job
  - Check `is_moving = false` AND `updated_at` > threshold → push notification
- Inspired by iSharingOf's elderly care feature

### 3.3 Battery Low Alert
- Push notification to family when a member's battery drops below 20%
- Triggered in `useLocationTracking` when battery changes cross the 20% threshold
- Edge Function: `send-battery-alert` (similar to `send-sos-notification`)

### 3.4 Chat Improvements
- Infinite scroll / pagination (load older messages on scroll up)
- Typing indicator (Supabase Realtime presence)
- Location message tap → opens map centered on that pin
- Read receipts ("Seen by X members")
- Follow language context for all date strings

### 3.5 Driving Mode Detection
- Auto-detect when speed consistently > 40 km/h for 60+ seconds
- Show 🚗 driving badge on member card and map marker
- Optional: alert when speed exceeds threshold (configurable)

### 3.6 Deep Link Share Invite
- Generate link: `togetherhome://join?code=XXXXXX`
- Universal Link / App Link for Android
- "Share Invite" button with native share sheet

---

## 💰 Sprint 4 — Monetization Design (TBD)

> This sprint is about **designing the business model only**. No features are removed or locked in earlier sprints — everyone already has access to everything. Sprint 4 determines how to introduce optional premium tiers for sustainability.

### Design Considerations
1. **Freemium vs. Subscription**: Free tier with history limit vs. flat monthly subscription
2. **Suggested Tier Structure** (inspired by iSharingOf, adapted for together-home):
   | Feature | Free | Pro (~$5/mo) |
   |---|---|---|
   | Real-time location | ✅ | ✅ |
   | Geofences | 2 zones | Unlimited |
   | Location History | 24h | 90 days |
   | Battery & Inactivity Alerts | ✅ | ✅ |
   | Driving Mode | ✅ | ✅ |
   | Chat | ✅ | ✅ |
   | Members per family | 5 | Unlimited |
   | Multiple family groups | 1 | 5 |

3. **Payment integration options**: Stripe (web) + RevenueCat (mobile)
4. **Grandfathering**: Early users get Pro free for 12 months
5. **Family plan**: One subscription covers all members in a family group

---

## Technical Debt Backlog

| Issue | Priority | Notes |
|---|---|---|
| `check-geofence` edge function — verify existence | 🔴 High | Silently failing if not deployed |
| Chat hardcodes Vietnamese in date formats | 🟡 Med | Pass `locale` to `formatDistanceToNow` |
| Map tile differs by language (inconsistent) | 🟡 Med | Use one tile layer for both languages |
| `live_location_sessions` no cleanup | 🟡 Med | Add cleanup on app open / cron |
| Image upload: validate MIME type not just size | 🟡 Med | Check `file.type` before upload |
| No Supabase Realtime reconnect logic | 🟡 Med | Add exponential backoff |
| `user_locations` history: no TTL / cleanup | 🟡 Med | Add Supabase cron to purge > 90 days |
