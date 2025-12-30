#!/bin/bash
# LOT Platform - GitHub Issues Creation Script
# Run: bash create-issues.sh

set -e

echo "Creating GitHub Issues for LOT Platform..."

# Milestone 0 - Foundation
gh issue create --title "[MICRO] Initialize Repository & Docs" --label "microtask" --body "## Description
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

gh issue create --title "[MICRO] Create Cloudflare Worker Base Project" --label "microtask" --body "## Description
Initialize Cloudflare Worker with TypeScript and Wrangler.

### Tasks
- [ ] Configure wrangler.toml
- [ ] Bind D1, KV, R2, Queues

## Acceptance Criteria
- Worker runs locally
- Deploys to Cloudflare successfully

## Dependencies
Issue #2"

# Milestone 1 - Auth
gh issue create --title "[MICRO] Create USERS Table (D1)" --label "microtask" --body "## Description
Design and migrate USERS table.

### Fields
- id, name, email, level, trust_score, membership_tier, reward_points, created_at

## Acceptance Criteria
- Table exists in D1
- Can insert & query users

## Dependencies
Issue #3"

gh issue create --title "[MICRO] Implement Email OTP Authentication" --label "microtask" --body "## Description
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
Issue #4"

gh issue create --title "[MICRO] Session Management Middleware" --label "microtask" --body "## Description
Protect APIs using session tokens.

## Acceptance Criteria
- Unauthorized users blocked
- Sessions expire properly

## Dependencies
Issue #5"

# Milestone 2 - Inventory
gh issue create --title "[MICRO] Create ITEMS Table" --label "microtask" --body "## Description
Design item inventory schema.

### Fields
- id, name, category, replacement_value, risk_level, min_level_required, available

## Acceptance Criteria
- Items can be added & queried

## Dependencies
Issue #3"

gh issue create --title "[MICRO] Implement Item Search API" --label "microtask" --body "## Description
Enable users to discover items.

### Features
- Search by name
- Filter by category, availability, level

## Acceptance Criteria
- Accurate search results
- Fast response

## Dependencies
Issue #7"

gh issue create --title "[MICRO] Availability Calculation Engine" --label "microtask" --body "## Description
Determine real-time availability from borrow records.

## Acceptance Criteria
- No double-borrow possible

## Dependencies
Issue #7, Issue #12"

# Milestone 3 - Subscription
gh issue create --title "[MICRO] Create SUBSCRIPTIONS Table" --label "microtask" --body "## Description
Store active membership plans.

### Fields
- user_id, plan, max_items, max_risk_level, monthly_fee, expiry_date

## Acceptance Criteria
- Subscriptions persist correctly

## Dependencies
Issue #4"

gh issue create --title "[MICRO] Subscription Plan Rules Engine" --label "microtask" --body "## Description
Define and enforce plan limits.

## Acceptance Criteria
- Users blocked beyond limits

## Dependencies
Issue #10"

gh issue create --title "[MICRO] Payment Webhook Handler" --label "microtask" --body "## Description
Handle subscription payments (Stripe/PayHere).

## Acceptance Criteria
- Subscription state reflects payment status

## Dependencies
Issue #10"

# Milestone 4 - Borrow/Return
gh issue create --title "[MICRO] Create BORROW_RECORDS Table" --label "microtask" --body "## Description
Track item lending lifecycle.

### Fields
- id, user_id, item_id, borrowed_at, due_at, returned_at, condition_notes

## Acceptance Criteria
- Borrow history persists correctly

## Dependencies
Issue #4, Issue #7"

gh issue create --title "[MICRO] Borrow Validation Logic" --label "microtask" --body "## Description
Ensure safe borrowing.

### Checks
- Active subscription
- Borrow limit
- User level
- Item availability

## Acceptance Criteria
- Invalid borrows blocked

## Dependencies
Issue #11, Issue #13"

gh issue create --title "[MICRO] Atomic Borrow Lock & QR Code" --label "microtask" --body "## Description
Prevent race conditions during borrow.

## Acceptance Criteria
- No double-lending possible

## Dependencies
Issue #14"

gh issue create --title "[MICRO] Return & Condition Verification" --label "microtask" --body "## Description
Handle item return flow with staff verification.

## Acceptance Criteria
- Inventory state correct after return

## Dependencies
Issue #15"

# Milestone 5 - Trust/Rewards
gh issue create --title "[MICRO] Level Progression Rules" --label "microtask" --body "## Description
Define levels (L1-L5) and unlock thresholds.

## Acceptance Criteria
- Level upgrades automatic

## Dependencies
Issue #4"

gh issue create --title "[MICRO] Trust Score Engine" --label "microtask" --body "## Description
Compute trust score changes (late/damage penalties, clean rewards).

## Acceptance Criteria
- Trust score affects access

## Dependencies
Issue #16"

gh issue create --title "[MICRO] Reward Points System" --label "microtask" --body "## Description
Grant points for positive actions.

## Acceptance Criteria
- Points tracked & redeemable

## Dependencies
Issue #17, Issue #22"

# Milestone 6 - Community
gh issue create --title "[MICRO] Media Upload to R2" --label "microtask" --body "## Description
Allow users to upload build proof (video/images).

## Acceptance Criteria
- Files stored securely in R2

## Dependencies
Issue #3"

gh issue create --title "[MICRO] Create COMMUNITY_POSTS Table" --label "microtask" --body "## Description
Store user build submissions.

## Acceptance Criteria
- Posts linked to items & users

## Dependencies
Issue #4, Issue #7"

gh issue create --title "[MICRO] Post Approval & Reward Queue" --label "microtask" --body "## Description
Moderate and reward submissions via Cloudflare Queues.

## Acceptance Criteria
- Rewards granted only after approval

## Dependencies
Issue #21"

gh issue create --title "[MICRO] Public Build Feed API" --label "microtask" --body "## Description
Expose community builds with filters.

## Acceptance Criteria
- Filterable by item & user

## Dependencies
Issue #22"

# Milestone 7 - Admin
gh issue create --title "[MICRO] Admin Role & Permissions" --label "microtask" --body "## Description
Differentiate admin vs user actions.

## Acceptance Criteria
- Admin-only endpoints protected

## Dependencies
Issue #6"

gh issue create --title "[MICRO] Audit Logging System" --label "microtask" --body "## Description
Track sensitive operations.

## Acceptance Criteria
- Logs stored & queryable

## Dependencies
Issue #24"

# Milestone 8 - Notifications
gh issue create --title "[MICRO] Borrow & Return Notifications" --label "microtask" --body "## Description
Notify users via email for borrow/return events.

## Acceptance Criteria
- Timely, accurate notifications

## Dependencies
Issue #15"

gh issue create --title "[MICRO] Level Unlock & Reward Alerts" --label "microtask" --body "## Description
Notify progression events.

## Acceptance Criteria
- Users informed automatically

## Dependencies
Issue #19"

# Milestone 9 - Security
gh issue create --title "[MICRO] Rate Limiting" --label "microtask" --body "## Description
Protect APIs from abuse (per-IP, per-user).

## Acceptance Criteria
- Requests throttled appropriately

## Dependencies
Issue #3"

gh issue create --title "[MICRO] Turnstile Integration" --label "microtask" --body "## Description
Protect auth & uploads with Cloudflare Turnstile.

## Acceptance Criteria
- Bots blocked effectively

## Dependencies
Issue #5, Issue #20"

# Milestone 10 - Observability
gh issue create --title "[MICRO] Logging & Error Tracking" --label "microtask" --body "## Description
Centralize logs with structured format.

## Acceptance Criteria
- Errors traceable

## Dependencies
Issue #3"

gh issue create --title "[MICRO] Usage Metrics" --label "microtask" --body "## Description
Track platform health metrics.

## Acceptance Criteria
- Metrics visible to admin

## Dependencies
Issue #24"

echo "All 30 issues created successfully!"
