# LOT Platform — Project Scope

## Objective
Build a Cloudflare Workers–based digital platform to manage a physical Library of Things that allows users to:
- Search & discover items
- Subscribe to membership plans
- Borrow & return physical items
- Gain trust, levels, and rewards
- Upload build proof (video/images)
- Participate in a moderated community
- Unlock higher-value items progressively

## System Principles
- **Serverless** (Cloudflare-first)
- **Trust & reputation driven**
- **Physical + digital sync**
- **Minimal friction for users**
- **Human-in-the-loop** for high-risk actions

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 |
| Media Storage | Cloudflare R2 |
| Cache / Session | Cloudflare KV |
| Async Jobs | Cloudflare Queues |
| Auth | Email OTP |
| Payments | Stripe / PayHere |
| Frontend | TBD (out of scope for worker) |

## Module Breakdown

1. **Authentication & Identity** — Email OTP, sessions
2. **Item Catalog & Inventory** — Items, search, availability
3. **Subscription & Access Control** — Plans, limits, payments
4. **Borrow / Return Workflow** — Core lending logic, QR handover
5. **Trust, Levels & Rewards** — Progression system
6. **Community & Proof System** — Build videos, moderation
7. **Admin & Moderation Tools** — Override, audit logs
8. **Notifications & Automation** — Email alerts, queues
9. **Security & Abuse Prevention** — Rate limiting, Turnstile
10. **Observability & Logging** — Metrics, error tracking

## Data Model

### Core Tables (D1)

```
USERS: id, name, email, level, trust_score, membership_tier, reward_points, created_at
ITEMS: id, name, category, replacement_value, risk_level, min_level_required, available
SUBSCRIPTIONS: user_id, plan, monthly_fee, max_items, max_risk_level, expiry_date
BORROW_RECORDS: id, user_id, item_id, borrowed_at, due_at, returned_at, condition_notes
COMMUNITY_POSTS: id, user_id, item_id, video_url, description, approved, reward_granted
```

## Level System

| Level | Access |
|-------|--------|
| L1 | LEGO kits, basic tools |
| L2 | ESP32, sensors, motors |
| L3 | Drones, RC kits |
| L4 | 3D printers, CNC |
| L5 | High-end lab equipment |

## Subscription Plans

| Plan | Items | Risk Level | Features |
|------|-------|------------|----------|
| BASIC | 1 | Low | No rewards |
| MAKER | 2-3 | Medium | Rewards enabled |
| INNOVATOR | Unlimited | High | Priority booking, higher multiplier |
