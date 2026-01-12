-- Migration number: 0001 	 2025-06-19T18:13:02.648Z
-- Description: Add pandas table

CREATE TABLE IF NOT EXISTS  pandas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pandapuid INTEGER DEFAULT 0,
    name TEXT NOT NULL,
    picture TEXT,
    gender TEXT CHECK(gender IN ('male', 'female')) NOT NULL,
    birthday TEXT, -- SQLite 使用 TEXT 存储日期
    birth_place TEXT,
    current_location TEXT,
    father_id INTEGER DEFAULT 0,
    mother_id INTEGER DEFAULT 0,
    weight REAL,
    health_status TEXT,
    personality TEXT,
    appearance TEXT,
    is_alive BOOLEAN DEFAULT 1,
    popularity_score INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP    
)