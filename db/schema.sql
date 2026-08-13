-- ============================================================
-- AI 论坛数据库 Schema
-- 共 9 张表 + 5 个索引
-- 全部使用 CREATE TABLE IF NOT EXISTS，可重复执行（幂等）
-- 所有外键均 ON DELETE CASCADE，保证父行删除时级联清理
-- ============================================================

-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT,
  email TEXT,
  avatar_text TEXT,
  bio TEXT,
  handle TEXT,
  profession TEXT,
  city TEXT,
  joined_at DATE,
  status TEXT,
  roles TEXT[],
  password_hash TEXT,  -- 存储 bcrypt 哈希，不存明文
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 用户统计表（与 users 一对一）
CREATE TABLE IF NOT EXISTS user_stats (
  user_id TEXT PRIMARY KEY,
  post_count INT,
  favorite_count INT,
  following_count INT,
  follower_count INT,
  influence_score DECIMAL(3,1),
  total_likes INT,
  total_favorited INT,
  CONSTRAINT fk_user_stats_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- 3. 板块表
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT,
  description TEXT,
  icon TEXT,
  today_posts INT,
  post_count INT,
  followers INT,
  governance_mode TEXT,
  color TEXT
);

-- 4. 话题表（热门话题）
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT,
  heat INT
);

-- 5. 标签表（SERIAL 自增主键，name 唯一约束防重）
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- 6. 帖子表
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT,
  summary TEXT,
  content TEXT,
  author_id TEXT,
  board_id TEXT,
  likes INT,
  comments_count INT,
  views INT,
  favorites_count INT,
  shares_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ai_summary TEXT,
  ai_risk_level TEXT,
  quality_score DECIMAL(3,1),
  risk_level TEXT,
  status TEXT DEFAULT 'open',
  source_type TEXT,
  CONSTRAINT fk_posts_author
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_posts_board
    FOREIGN KEY (board_id) REFERENCES boards(id)
    ON DELETE CASCADE
);

-- 7. 帖子-标签关联表（多对多）
--    tag_name 为纯文本，不引用 tags 表（tags 主键为 SERIAL id）
CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT,
  tag_name TEXT,
  PRIMARY KEY (post_id, tag_name),
  CONSTRAINT fk_post_tags_post
    FOREIGN KEY (post_id) REFERENCES posts(id)
    ON DELETE CASCADE
);

-- 8. 评论表（支持楼中楼：parent_id 自引用，允许 NULL 表示顶级评论）
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT,
  author_id TEXT,
  parent_id TEXT,
  content TEXT,
  likes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_comments_post
    FOREIGN KEY (post_id) REFERENCES posts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_comments_author
    FOREIGN KEY (author_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent
    FOREIGN KEY (parent_id) REFERENCES comments(id)
    ON DELETE CASCADE
);

-- 9. 通知表
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT,
  title TEXT,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  target_id TEXT,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- 10. 帖子点赞关联表（记录每个用户对每个帖子的点赞状态，联合主键防重复）
CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_post_likes_post
    FOREIGN KEY (post_id) REFERENCES posts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_post_likes_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- 11. 帖子收藏关联表（记录每个用户对每个帖子的收藏状态，联合主键防重复）
CREATE TABLE IF NOT EXISTS post_favorites (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_post_favorites_post
    FOREIGN KEY (post_id) REFERENCES posts(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_post_favorites_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- 12. 评论点赞关联表（记录每个用户对每条评论的点赞）
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id),
  CONSTRAINT fk_comment_likes_comment
    FOREIGN KEY (comment_id) REFERENCES comments(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_comment_likes_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);

-- ============================================================
-- 索引（覆盖高频查询路径）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_board_id ON posts(board_id);
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag_name ON post_tags(tag_name);
-- 新增：按用户维度查询点赞/收藏列表
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_post_favorites_user_id ON post_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id);
-- 新增：评论作者索引（用于"我的评论"查询）
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
