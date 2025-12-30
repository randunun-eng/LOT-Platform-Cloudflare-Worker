-- LOT Platform Database Schema
-- Run: wrangler d1 execute lot-db --local --file=./schema.sql

-- Drop existing tables (order matters due to foreign keys)
DROP TABLE IF EXISTS community_posts;
DROP TABLE IF EXISTS borrow_records;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS audit_logs;

-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  level INTEGER DEFAULT 1,
  trust_score INTEGER DEFAULT 100,
  membership_tier TEXT DEFAULT 'BASIC', -- BASIC, MAKER, INNOVATOR
  reward_points INTEGER DEFAULT 0,
  is_admin INTEGER DEFAULT 0, -- 0 = false, 1 = true
  created_at INTEGER DEFAULT (unixepoch())
);

-- Items table
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'lego', 'iot', 'tools', '3d_printer', 'electronics'
  replacement_value INTEGER NOT NULL, -- in cents
  risk_level TEXT DEFAULT 'low', -- 'low', 'medium', 'high'
  min_level_required INTEGER DEFAULT 1,
  available INTEGER DEFAULT 1, -- 0 = false, 1 = true
  image_url TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  plan TEXT NOT NULL, -- 'BASIC', 'MAKER', 'INNOVATOR'
  max_items INTEGER NOT NULL,
  max_risk_level TEXT NOT NULL,
  monthly_fee INTEGER NOT NULL, -- in cents
  started_at INTEGER DEFAULT (unixepoch()),
  expires_at INTEGER,
  payment_id TEXT, -- Stripe/PayHere reference
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Borrow records table
CREATE TABLE borrow_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  borrowed_at INTEGER DEFAULT (unixepoch()),
  due_at INTEGER NOT NULL,
  returned_at INTEGER,
  condition_notes TEXT,
  qr_code TEXT, -- handover verification code
  status TEXT DEFAULT 'active', -- 'active', 'returned', 'overdue'
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Community posts table
CREATE TABLE community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  video_url TEXT,
  description TEXT,
  approved INTEGER DEFAULT 0, -- 0 = pending, 1 = approved, -1 = rejected
  reward_granted INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

-- Audit logs table
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT, -- 'user', 'item', 'borrow', 'subscription'
  target_id INTEGER,
  details TEXT, -- JSON string
  created_at INTEGER DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_available ON items(available);
CREATE INDEX idx_borrow_user ON borrow_records(user_id);
CREATE INDEX idx_borrow_item ON borrow_records(item_id);
CREATE INDEX idx_borrow_status ON borrow_records(status);
CREATE INDEX idx_community_approved ON community_posts(approved);
CREATE INDEX idx_audit_action ON audit_logs(action);
