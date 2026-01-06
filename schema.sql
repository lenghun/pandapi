-- 启用外键约束
PRAGMA foreign_keys = ON;

-- 熊猫表
CREATE TABLE IF NOT EXISTS pandas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gender TEXT CHECK(gender IN ('male', 'female')) NOT NULL,
    birthday TEXT,
    birth_place TEXT,
    current_location TEXT,
    father_id INTEGER,
    mother_id INTEGER,
    weight REAL CHECK(weight > 0),
    health_status TEXT DEFAULT '健康',
    personality TEXT,
    appearance TEXT,
    is_alive BOOLEAN DEFAULT TRUE,
    popularity_score INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (father_id) REFERENCES pandas(id) ON DELETE SET NULL,
    FOREIGN KEY (mother_id) REFERENCES pandas(id) ON DELETE SET NULL,
    UNIQUE(name, birthday)
);

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    role TEXT CHECK(role IN ('user', 'keeper', 'admin')) DEFAULT 'user',
    is_verified BOOLEAN DEFAULT FALSE,
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 内容分享表
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    panda_id INTEGER,
    title TEXT,
    content TEXT NOT NULL,
    media_type TEXT CHECK(media_type IN ('text', 'image', 'video', 'mixed')) DEFAULT 'text',
    media_urls TEXT, -- JSON 数组存储
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    location TEXT,
    is_pinned BOOLEAN DEFAULT FALSE,
    status TEXT CHECK(status IN ('draft', 'published', 'hidden')) DEFAULT 'published',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (panda_id) REFERENCES pandas(id) ON DELETE SET NULL
);

-- 评论表
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER,
    content TEXT NOT NULL,
    like_count INTEGER DEFAULT 0,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

-- 点赞表
CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT CHECK(target_type IN ('post', 'comment', 'panda')) NOT NULL,
    target_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(user_id, target_type, target_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 关注表
CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 熊猫关系表
CREATE TABLE IF NOT EXISTS panda_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panda_id INTEGER NOT NULL,
    related_panda_id INTEGER NOT NULL,
    relation_type TEXT CHECK(relation_type IN (
        'parent', 'child', 'sibling', 'spouse',
        'grandparent', 'grandchild', 'cousin', 'other'
    )) NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(panda_id, related_panda_id, relation_type),
    FOREIGN KEY (panda_id) REFERENCES pandas(id) ON DELETE CASCADE,
    FOREIGN KEY (related_panda_id) REFERENCES pandas(id) ON DELETE CASCADE
);

-- 熊猫媒体表
CREATE TABLE IF NOT EXISTS panda_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panda_id INTEGER NOT NULL,
    uploader_id INTEGER NOT NULL,
    media_type TEXT CHECK(media_type IN ('photo', 'video')) NOT NULL,
    media_url TEXT NOT NULL,
    caption TEXT,
    tags TEXT, -- JSON 数组
    shot_date TEXT,
    shot_location TEXT,
    is_official BOOLEAN DEFAULT TRUE,
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (panda_id) REFERENCES pandas(id) ON DELETE CASCADE,
    FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT CHECK(type IN ('behavior', 'appearance', 'trend')) NOT NULL,
    use_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- 内容标签关联表
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX idx_pandas_name ON pandas(name);
CREATE INDEX idx_pandas_location ON pandas(current_location);
CREATE INDEX idx_pandas_popularity ON pandas(popularity_score DESC);
CREATE INDEX idx_pandas_birthday ON pandas(birthday DESC);
CREATE INDEX idx_pandas_alive ON pandas(is_alive) WHERE is_alive = TRUE;

CREATE INDEX idx_posts_panda ON posts(panda_id, created_at DESC);
CREATE INDEX idx_posts_user ON posts(user_id, created_at DESC);
CREATE INDEX idx_posts_status ON posts(status) WHERE status = 'published';

CREATE INDEX idx_comments_post ON comments(post_id, created_at DESC);
CREATE INDEX idx_comments_user ON comments(user_id, created_at DESC);

CREATE INDEX idx_likes_target ON likes(target_type, target_id);
CREATE INDEX idx_likes_user ON likes(user_id, created_at DESC);

CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);

CREATE INDEX idx_relationships_panda ON panda_relationships(panda_id);
CREATE INDEX idx_relationships_related ON panda_relationships(related_panda_id);

CREATE INDEX idx_media_panda ON panda_media(panda_id, shot_date DESC);
CREATE INDEX idx_media_uploader ON panda_media(uploader_id, created_at DESC);