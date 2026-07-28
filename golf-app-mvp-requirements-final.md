# Golf Score Tracking App - MVP Requirements (Final, Build-Ready)

## Project Overview
A personal golf score tracking progressive web app (PWA) that allows users to log, analyze, and track their golf game performance. Built mobile-first with offline-first architecture, single-device local storage for MVP, designed to scale toward monetization with premium analytics and social features in later phases.

## MVP Goals
1. Enable users to quickly log golf rounds on any device
2. Store round history with detailed hole-by-hole scoring
3. Provide basic statistics and performance insights
4. Work fully offline (all data local to the device)
5. Establish foundation for future monetization (premium analytics, social features)

## Core Features (MVP)

### 1. Course Search & Selection
- **Functionality:**
  - Search courses by name or city (text search only — no geolocation in MVP)
  - Display course details: name, location, holes, par, course rating/slope (when available from API)
  - Select tee box using whatever tee names the API returns for that course (don't hardcode tee colors)
  - Save recently played courses for quick access
- **API Integration:**
  - GolfCourseAPI (free tier) is the sole course data source for MVP
  - If a course isn't in GolfCourseAPI, it cannot be logged in MVP — no manual course entry (deferred to a later phase)
  - No manual fallback and no geolocation/"nearby courses" in MVP — both are explicitly post-MVP
- **UI Elements:**
  - Search bar with autocomplete
  - Course card with key details
  - Recently played courses carousel
  - Tee selection radio/dropdown

### 2. Round Entry (Core UX)
- **Functionality:**
  - Select/add course and tee box
  - Choose round length: **Front 9, Back 9, or Full 18** (full support for both 9- and 18-hole rounds)
  - Enter score for each hole in the selected set
  - Display current hole context: hole number, par, handicap index, distance
  - Progress indicator (e.g., "Hole 4 of 9" or "Hole 12 of 18")
  - Quick navigation between holes (next/previous)
  - In-progress rounds auto-save as a draft and can be resumed later (e.g., app closed mid-round)
- **Data Captured Per Hole:**
  - Score (required)
  - Fairway hit (Y/N — only asked for par 4s/5s)
  - Greens in regulation (auto-calculated: strokes to reach green ≤ par − 2)
  - Putts (optional, manual entry only — not auto-calculated if left blank)
- **UI Elements:**
  - Large, touch-friendly score input (numpad style preferred)
  - Hole card with par/handicap display
  - Swipe or button navigation between holes
  - Save as draft (automatic)
  - Finish round button

### 3. Round Summary & Completion
- **Functionality:**
  - Display completed round overview
  - Show summary stats: total score, vs par, fairways hit %, GIRs (all scoped correctly for 9 vs. 18 holes played)
  - Allow editing individual hole scores after the round is finalized
  - Save/finalize round to local storage
  - Optional free-text notes field (course conditions, playing partners, weather — manual entry only, no weather API)
- **UI Elements:**
  - Scorecard view (all holes in the round, scrollable)
  - Summary stats widget
  - Edit buttons for individual holes
  - Save button

### 4. Round History & List View
- **Functionality:**
  - Display all recorded rounds in chronological order (newest first)
  - Show date, course name, round length (9/18), score, vs par
  - Tap to view detailed round scorecard
  - Delete/archive rounds (with confirmation)
  - Filter by date range or course is a nice-to-have, not required for MVP
- **UI Elements:**
  - Round cards (compact, swipe actions for delete)
  - Date grouping (This week, Last week, etc.)

### 5. Basic Statistics Dashboard
- **Functionality:**
  - Average score (all-time, last 10 rounds, last 50 rounds) — 9- and 18-hole rounds tracked/labeled separately, or normalized per-9 for fair comparison
  - Average vs par
  - Best/worst rounds
  - Handicap **estimate** (simple average of score-to-par over first 10 rounds — explicitly not a USGA-official calculation; label it as "estimate" in the UI)
  - Fairways hit percentage
  - GIR percentage
  - Holes with most/fewest average strokes
- **UI Elements:**
  - Stats cards/widgets
  - Simple line chart for score trend (last 10 rounds)
  - Breakdown by course (if 5+ rounds recorded at that course)

## Technical Requirements

### Frontend Stack
- **Framework:** React 18+ with TypeScript
- **Styling:** Tailwind CSS or Material-UI
- **State Management:** React Context or Zustand
- **Storage:** IndexedDB (via Dexie.js) + localStorage — this is the **only** data store for MVP; no backend, no accounts, no login
- **PWA:** Service Worker for offline support, manifest.json for "add to home screen" install
- **Build Tool:** Vite or Create React App

### Data Storage Architecture
Local-only (IndexedDB), single device/browser, no sync:
- User profile (name, handicap tracking metadata) — local only, no auth
- Rounds (complete round data, including in-progress drafts)
- Courses (cached course details from GolfCourseAPI responses)

**Structure:**
```
Rounds:
  - id (UUID)
  - courseId (string)
  - teeBox (string, as returned by API)
  - roundLength: "front9" | "back9" | "18"
  - status: "draft" | "complete"
  - date (ISO timestamp)
  - holes (array, length matches roundLength)
    - holeNumber: number
    - par: number
    - score: number
    - fairwayHit: boolean (optional, only applicable to par 4/5)
    - putts: number (optional, manual entry)
    - handicapIndex: number (optional)
  - notes: string (optional, free text incl. weather/conditions if user wants to log it)
  - totalScore: number (calculated)
  - totalPar: number (calculated)

Courses:
  - id (string from API)
  - name: string
  - location: {city, state, country}
  - holes: array
    - holeNumber: number
    - par: number
    - handicapIndex: number
    - distance: {[teeName]: number}
  - courseRating: {[teeName]: number}
  - slope: {[teeName]: number}
  - lastPlayedDate: timestamp
```

### Backend (Phase 2 - Not MVP)
- **Framework:** Node.js/Express
- **Database:** PostgreSQL
- **Auth:** JWT tokens
- **API:** REST endpoints for rounds sync, user data
- **Future:** Analytics, social features, handicap calculation service

### Third-Party Integrations (MVP)
- **GolfCourseAPI:** Sole course data lookup source (no fallback)

## User Flows

### Primary Flow: Log a Round
1. User opens app
2. Clicks "New Round"
3. Searches for/selects course by name or city
4. Selects tee box
5. Chooses Front 9, Back 9, or Full 18
6. Enters score hole-by-hole (swipe/button navigation)
7. Optional: adds fairway/putt data per hole
8. Completes round, reviews summary
9. Saves round
10. Returns to home screen

### Secondary Flow: Resume a Draft Round
1. User opens app mid-round (previously closed the app)
2. Sees "Resume round" prompt or draft card on home screen
3. Continues from the last hole entered

### Secondary Flow: View Stats
1. User clicks "Stats" tab
2. Sees personal dashboard with key metrics
3. Views trend chart of recent scores
4. Can tap on individual round to see details

### Secondary Flow: Review Past Round
1. User clicks "Rounds" or "History"
2. Browses list of recorded rounds
3. Taps a round to view full scorecard
4. Can edit individual hole scores if needed

## Success Metrics (MVP)
- App loads in < 2 seconds on mobile (offline included)
- Complete round entry in < 5 minutes on-course
- Works fully offline (no network required at any point in MVP)
- Can record 10 rounds without data loss
- Basic stats calculate correctly (score, par, handicap estimate) for both 9- and 18-hole rounds
- 3.5+ app store rating for usability (once distributed)

## Out of Scope (MVP)
- Social features (compare with friends, leaderboards)
- Advanced/official handicap calculations (USGA)
- Shot-by-shot analysis or swing data
- Integration with fitness trackers
- Cloud sync/backend storage or accounts/login
- Manual course entry (courses not in GolfCourseAPI can't be logged)
- Geolocation/"nearby courses" discovery
- Monetization/subscription features
- Native mobile app store distribution (web-first only)
- Multiplayer/group rounds tracking
- Weather API integration (manual notes only)
- Course reviews or ratings

## Future Phases (Post-MVP)

### Phase 2: Backend, Accounts & Sync
- User authentication
- Cloud storage for round history
- Cross-device sync
- Backup/export functionality
- Manual course entry (fallback when GolfCourseAPI doesn't have a course)
- Geolocation-based nearby course discovery

### Phase 3: Premium Analytics
- Advanced/official handicap calculation
- Detailed scoring trends and predictions
- Peer comparison (anonymized data)
- Performance by course/tee/conditions
- Shot pattern analysis

### Phase 4: Social & Community
- Share rounds with friends
- Private group leaderboards
- Course reviews and comments
- Find playing partners

## Notes for Development
- **Mobile-first design:** test on small screens throughout development
- **Offline-first:** all data operations must work without network (no API calls required except course search/lookup, which requires connectivity by nature)
- **Performance:** aim for low data usage (important for on-course use)
- **Accessibility:** WCAG 2.1 AA minimum (buttons, contrast, labels)
- **Error handling:** graceful fallback/messaging when GolfCourseAPI is unreachable or a course isn't found (since there's no manual entry fallback in MVP)

## Decisions Locked In From Clarification
- Course lookup: GolfCourseAPI only, no manual entry fallback in MVP
- Geolocation/nearby courses: deferred to Phase 2
- Round length: Front 9, Back 9, and Full 18 all supported in MVP
- Storage: local-only (IndexedDB), no login/backend/sync in MVP — matches original Phase 2 scoping
