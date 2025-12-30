# GitHub Issues for LOT Platform

This file contains all GitHub Issues for the LOT Platform, formatted for GitHub CLI bulk creation.

## How to Use

```bash
# Install GitHub CLI if not already installed
# Then run each issue creation command below
```

---

## Milestone 0 — Project Foundation

### Issue 0.1: Initialize Repository & Docs
```bash
gh issue create --title "[MICRO] Initialize Repository & Docs" --label "microtask,foundation,docs" --body "## Description
Set up the base GitHub repository with documentation and structure.

### Tasks
- [ ] Create SCOPE.md
- [ ] Create MICROTASKS.md
- [ ] Add ENV.example

## Acceptance Criteria
- Repo is readable by contributors
- Scope clearly documented

## Dependencies
None"
```

### Issue 0.2: Create Cloudflare Worker Base Project
```bash
gh issue create --title "[MICRO] Create Cloudflare Worker Base Project" --label "microtask,foundation,cloudflare" --body "## Description
Initialize Cloudflare Worker with TypeScript and Wrangler.

### Tasks
- [ ] Initialize worker project
- [ ] Enable TypeScript
- [ ] Configure wrangler.toml
- [ ] Bind D1, KV, R2, Queues (placeholders)

## Acceptance Criteria
- Worker runs locally
- Deploys to Cloudflare successfully

## Dependencies
Issue 0.1"
```

---

## Milestone 1 — Authentication & Users

### Issue 1.1: Create USERS Table (D1)
```bash
gh issue create --title "[MICRO] Create USERS Table (D1)" --label "microtask,database,auth" --body "## Description
Design and migrate USERS table.

### Fields
- id
- name
- email
- level
- trust_score
- membership_tier
- reward_points
- created_at

## Acceptance Criteria
- Table exists in D1
- Can insert & query users

## Dependencies
Issue 0.2"
```

### Issue 1.2: Implement Email OTP Authentication
```bash
gh issue create --title "[MICRO] Implement Email OTP Authentication" --label "microtask,auth,security" --body "## Description
Add passwordless login using email OTP.

### Tasks
- [ ] Generate OTP
- [ ] Store OTP in KV with TTL
- [ ] Verify OTP
- [ ] Auto-create user if new

## Acceptance Criteria
- User can log in using OTP
- OTP expires correctly

## Dependencies
Issue 1.1"
```

### Issue 1.3: Session Management Middleware
```bash
gh issue create --title "[MICRO] Session Management Middleware" --label "microtask,auth,middleware" --body "## Description
Protect APIs using session tokens.

### Tasks
- [ ] Generate session token
- [ ] Store in KV
- [ ] Middleware for protected routes

## Acceptance Criteria
- Unauthorized users blocked
- Sessions expire properly

## Dependencies
Issue 1.2"
```

---

## Milestone 2 — Item Catalog & Inventory

### Issue 2.1: Create ITEMS Table
```bash
gh issue create --title "[MICRO] Create ITEMS Table" --label "microtask,database,inventory" --body "## Description
Design item inventory schema.

### Fields
- id
- name
- category
- replacement_value
- risk_level
- min_level_required
- available

## Acceptance Criteria
- Items can be added & queried

## Dependencies
Issue 0.2"
```

### Issue 2.2: Implement Item Search API
```bash
gh issue create --title "[MICRO] Implement Item Search API" --label "microtask,api,inventory" --body "## Description
Enable users to discover items.

### Features
- Search by name
- Filter by category
- Filter by availability
- Filter by level access

## Acceptance Criteria
- Accurate search results
- Fast response (<200ms cached)

## Dependencies
Issue 2.1"
```

### Issue 2.3: Availability Calculation Engine
```bash
gh issue create --title "[MICRO] Availability Calculation Engine" --label "microtask,inventory,logic" --body "## Description
Determine real-time availability from borrow records.

### Tasks
- [ ] Compute availability
- [ ] Cache results in KV
- [ ] Invalidate cache on borrow/return

## Acceptance Criteria
- No double-borrow possible

## Dependencies
Issue 2.1, Issue 4.1"
```

---

## Milestone 3 — Subscription System

### Issue 3.1: Create SUBSCRIPTIONS Table
```bash
gh issue create --title "[MICRO] Create SUBSCRIPTIONS Table" --label "microtask,database,billing" --body "## Description
Store active membership plans.

### Fields
- user_id
- plan
- max_items
- max_risk_level
- monthly_fee
- expiry_date

## Acceptance Criteria
- Subscriptions persist correctly

## Dependencies
Issue 1.1"
```

### Issue 3.2: Subscription Plan Rules Engine
```bash
gh issue create --title "[MICRO] Subscription Plan Rules Engine" --label "microtask,billing,logic" --body "## Description
Define and enforce plan limits.

### Tasks
- [ ] Encode plan rules in Worker
- [ ] Validate during borrow attempts

## Acceptance Criteria
- Users blocked beyond limits

## Dependencies
Issue 3.1"
```

### Issue 3.3: Payment Webhook Handler
```bash
gh issue create --title "[MICRO] Payment Webhook Handler" --label "microtask,billing,webhooks" --body "## Description
Handle subscription payments.

### Tasks
- [ ] Process payment success
- [ ] Activate / renew subscription
- [ ] Handle failure & expiry

## Acceptance Criteria
- Subscription state reflects payment status

## Dependencies
Issue 3.1"
```

---

## Milestone 4 — Borrow & Return Engine

### Issue 4.1: Create BORROW_RECORDS Table
```bash
gh issue create --title "[MICRO] Create BORROW_RECORDS Table" --label "microtask,database,core" --body "## Description
Track item lending lifecycle.

### Fields
- id
- user_id
- item_id
- borrowed_at
- due_at
- returned_at
- condition_notes

## Acceptance Criteria
- Borrow history persists correctly

## Dependencies
Issue 1.1, Issue 2.1"
```

### Issue 4.2: Borrow Validation Logic
```bash
gh issue create --title "[MICRO] Borrow Validation Logic" --label "microtask,core,logic" --body "## Description
Ensure safe borrowing.

### Checks
- Active subscription
- Borrow limit
- User level
- Item availability

## Acceptance Criteria
- Invalid borrows blocked

## Dependencies
Issue 3.2, Issue 4.1"
```

### Issue 4.3: Atomic Borrow Lock & QR Code
```bash
gh issue create --title "[MICRO] Atomic Borrow Lock & QR Code" --label "microtask,core,security" --body "## Description
Prevent race conditions during borrow.

### Tasks
- [ ] Atomic transaction
- [ ] Lock item
- [ ] Generate QR for physical handover

## Acceptance Criteria
- No double-lending possible

## Dependencies
Issue 4.2"
```

### Issue 4.4: Return & Condition Verification
```bash
gh issue create --title "[MICRO] Return & Condition Verification" --label "microtask,core,admin" --body "## Description
Handle item return flow.

### Tasks
- [ ] Staff verification endpoint
- [ ] Condition notes
- [ ] Unlock item

## Acceptance Criteria
- Inventory state correct after return

## Dependencies
Issue 4.3"
```

---

## Milestone 5 — Trust, Levels & Rewards

### Issue 5.1: Level Progression Rules
```bash
gh issue create --title "[MICRO] Level Progression Rules" --label "microtask,gamification" --body "## Description
Define levels and unlock thresholds.

### Level Access
- L1: LEGO kits, basic tools
- L2: ESP32, sensors, motors
- L3: Drones, RC kits
- L4: 3D printers, CNC
- L5: High-end lab equipment

## Acceptance Criteria
- Level upgrades automatic

## Dependencies
Issue 1.1"
```

### Issue 5.2: Trust Score Engine
```bash
gh issue create --title "[MICRO] Trust Score Engine" --label "microtask,logic,risk" --body "## Description
Compute trust score changes.

### Rules
- Late return → penalty
- Damage penalty
- Clean return → reward

## Acceptance Criteria
- Trust score affects access

## Dependencies
Issue 4.4"
```

### Issue 5.3: Reward Points System
```bash
gh issue create --title "[MICRO] Reward Points System" --label "microtask,gamification" --body "## Description
Grant points for positive actions.

### Sources
- Successful return (+5)
- Approved build post (+10)
- Community contribution

## Acceptance Criteria
- Points tracked & redeemable

## Dependencies
Issue 5.1, Issue 6.3"
```

---

## Milestone 6 — Community & Proof System

### Issue 6.1: Media Upload to R2
```bash
gh issue create --title "[MICRO] Media Upload to R2" --label "microtask,media,security" --body "## Description
Allow users to upload build proof.

### Constraints
- Video size limit (50MB)
- Duration limit (90sec)
- File type validation

## Acceptance Criteria
- Files stored securely in R2

## Dependencies
Issue 0.2"
```

### Issue 6.2: Create COMMUNITY_POSTS Table
```bash
gh issue create --title "[MICRO] Create COMMUNITY_POSTS Table" --label "microtask,database,community" --body "## Description
Store user build submissions.

### Fields
- id
- user_id
- item_id
- video_url
- description
- approved
- reward_granted

## Acceptance Criteria
- Posts linked to items & users

## Dependencies
Issue 1.1, Issue 2.1"
```

### Issue 6.3: Post Approval & Reward Queue
```bash
gh issue create --title "[MICRO] Post Approval & Reward Queue" --label "microtask,community,queues" --body "## Description
Moderate and reward submissions.

### Tasks
- [ ] Admin approval endpoint
- [ ] Queue reward grant
- [ ] Update user points

## Acceptance Criteria
- Rewards granted only after approval

## Dependencies
Issue 6.2"
```

### Issue 6.4: Public Build Feed API
```bash
gh issue create --title "[MICRO] Public Build Feed API" --label "microtask,api,community" --body "## Description
Expose community builds.

### Features
- List approved posts
- Filter by item
- Filter by user

## Acceptance Criteria
- Filterable by item & user

## Dependencies
Issue 6.3"
```

---

## Milestone 7 — Admin & Moderation

### Issue 7.1: Admin Role & Permissions
```bash
gh issue create --title "[MICRO] Admin Role & Permissions" --label "microtask,admin,security" --body "## Description
Differentiate admin vs user actions.

### Tasks
- [ ] Add admin flag to USERS
- [ ] Admin middleware
- [ ] Protect admin endpoints

## Acceptance Criteria
- Admin-only endpoints protected

## Dependencies
Issue 1.3"
```

### Issue 7.2: Audit Logging System
```bash
gh issue create --title "[MICRO] Audit Logging System" --label "microtask,admin,observability" --body "## Description
Track sensitive operations.

### Events to Log
- Borrow/return actions
- Admin overrides
- Damage reports
- Trust score changes

## Acceptance Criteria
- Logs stored & queryable

## Dependencies
Issue 7.1"
```

---

## Milestone 8 — Notifications

### Issue 8.1: Borrow & Return Notifications
```bash
gh issue create --title "[MICRO] Borrow & Return Notifications" --label "microtask,notifications" --body "## Description
Notify users via email.

### Events
- Borrow confirmation
- Return reminder (1 day before due)
- Overdue notice

## Acceptance Criteria
- Timely, accurate notifications

## Dependencies
Issue 4.3"
```

### Issue 8.2: Level Unlock & Reward Alerts
```bash
gh issue create --title "[MICRO] Level Unlock & Reward Alerts" --label "microtask,notifications,gamification" --body "## Description
Notify progression events.

### Events
- Level up notification
- Reward points earned

## Acceptance Criteria
- Users informed automatically

## Dependencies
Issue 5.3"
```

---

## Milestone 9 — Security & Abuse Prevention

### Issue 9.1: Rate Limiting
```bash
gh issue create --title "[MICRO] Rate Limiting" --label "microtask,security" --body "## Description
Protect APIs from abuse.

### Rules
- Per-IP limits
- Per-user limits
- Stricter limits on auth endpoints

## Acceptance Criteria
- Requests throttled per user/IP

## Dependencies
Issue 0.2"
```

### Issue 9.2: Turnstile Integration
```bash
gh issue create --title "[MICRO] Turnstile Integration" --label "microtask,security" --body "## Description
Protect auth & uploads with Cloudflare Turnstile.

### Protected Actions
- Login/OTP request
- Media upload
- Community post creation

## Acceptance Criteria
- Bots blocked effectively

## Dependencies
Issue 1.2, Issue 6.1"
```

---

## Milestone 10 — Observability

### Issue 10.1: Logging & Error Tracking
```bash
gh issue create --title "[MICRO] Logging & Error Tracking" --label "microtask,observability" --body "## Description
Centralize logs.

### Tasks
- [ ] Structured request logs
- [ ] Error logs with stack traces
- [ ] Log to external service (optional)

## Acceptance Criteria
- Errors traceable

## Dependencies
Issue 0.2"
```

### Issue 10.2: Usage Metrics
```bash
gh issue create --title "[MICRO] Usage Metrics" --label "microtask,analytics" --body "## Description
Track platform health.

### Metrics
- Active borrows count
- Item utilization rate
- User growth
- Top borrowed items

## Acceptance Criteria
- Metrics visible to admin

## Dependencies
Issue 7.1"
```

---

## Quick Create Script

Save this as `create-issues.ps1` and run:

```powershell
# Run all issue creation commands
# Make sure you're authenticated with: gh auth login

gh issue create --title "[MICRO] Initialize Repository & Docs" --label "microtask" --body "Set up SCOPE.md and MICROTASKS.md"
# ... (continue with all issues above)
```
