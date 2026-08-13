/**
 * 种子数据导入脚本
 * 将 src/utils/ai-forum/mockData.js 中的数据导入 PostgreSQL
 * 运行：npm run db:seed
 *
 * 幂等性：每次执行前 TRUNCATE 所有表（CASCADE），可重复运行
 * 导入顺序按 FK 依赖：users → user_stats → boards → topics → tags → posts → post_tags → comments → notifications
 */
import { query, pool } from '../db/pool.js';
import {
  currentUser,
  users,
  userStats,
  boards,
  hotTopics,
  tags,
  posts,
  comments,
  notifications,
  DEFAULT_PASSWORD_HASH,
} from '../src/utils/ai-forum/mockData.js';

// 记录每张表插入行数，用于最终汇总输出
const insertedCounts = {
  users: 0,
  user_stats: 0,
  boards: 0,
  topics: 0,
  tags: 0,
  posts: 0,
  post_tags: 0,
  comments: 0,
  notifications: 0,
};

/**
 * 清空所有表（按 FK 依赖反序列出），保证脚本幂等
 * CASCADE 会级联清理，但显式列出所有表更清晰、便于排查
 */
async function truncateAll() {
  await query(`
    TRUNCATE TABLE
      notifications,
      comments,
      post_tags,
      posts,
      tags,
      topics,
      boards,
      user_stats,
      users
    CASCADE
  `);
}

// users：roles 是数组，需用 $12::text[] 显式转型
// 新增 email + password_hash（默认密码 123456 的 bcrypt 哈希）
async function seedUsers() {
  for (const u of users) {
    await query(
      `INSERT INTO users (id, nickname, email, avatar_text, bio, handle, profession, city, joined_at, status, roles, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12)`,
      [
        u.id,
        u.nickname,
        u.email,
        u.avatarText,
        u.bio,
        u.handle,
        u.profession,
        u.city,
        u.joinedAt,
        u.status,
        u.roles,
        DEFAULT_PASSWORD_HASH,
      ]
    );
    insertedCounts.users++;
  }
}

// userStats 是单个对象，归属 currentUser（mockData 隐含约定）
async function seedUserStats() {
  await query(
    `INSERT INTO user_stats (user_id, post_count, favorite_count, following_count, follower_count, influence_score, total_likes, total_favorited)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      currentUser.id,
      userStats.postCount,
      userStats.favoriteCount,
      userStats.followingCount,
      userStats.followerCount,
      userStats.influenceScore,
      userStats.totalLikes,
      userStats.totalFavorited,
    ]
  );
  insertedCounts.user_stats++;
}

async function seedBoards() {
  for (const b of boards) {
    await query(
      `INSERT INTO boards (id, name, description, icon, today_posts, post_count, followers, governance_mode, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        b.id,
        b.name,
        b.description,
        b.icon,
        b.todayPosts,
        b.postCount,
        b.followers,
        b.governanceMode,
        b.color,
      ]
    );
    insertedCounts.boards++;
  }
}

async function seedTopics() {
  for (const t of hotTopics) {
    await query(
      `INSERT INTO topics (id, name, heat) VALUES ($1, $2, $3)`,
      [t.id, t.name, t.heat]
    );
    insertedCounts.topics++;
  }
}

// tags 表使用 SERIAL 主键 + name 唯一约束，ON CONFLICT 防重
async function seedTags() {
  for (const name of tags) {
    await query(
      `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
    insertedCounts.tags++;
  }
}

async function seedPosts() {
  for (const p of posts) {
    await query(
      `INSERT INTO posts (id, title, summary, content, author_id, board_id, likes, comments_count, views, favorites_count, shares_count, created_at, ai_summary, ai_risk_level, quality_score, risk_level, status, source_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        p.id,
        p.title,
        p.summary,
        p.content,
        p.authorId,
        p.boardId,
        p.likes,
        p.comments,              // mockData 中 comments 是评论数（number），存为 comments_count
        p.views,
        p.favoritesCount ?? 0,   // mockData 无此字段，默认 0
        p.sharesCount ?? 0,      // mockData 无此字段，默认 0
        p.createdAt,
        p.aiSummary,
        p.aiRiskLevel ?? null,   // mockData 无此字段，默认 null
        p.qualityScore,
        p.riskLevel,
        p.status,
        p.sourceType ?? null,    // mockData 无此字段，默认 null
      ]
    );
    insertedCounts.posts++;
  }
}

// post_tags：posts[].tags 数组展开为每条 (post_id, tag_name)
async function seedPostTags() {
  for (const p of posts) {
    if (!p.tags || p.tags.length === 0) continue;
    for (const tagName of p.tags) {
      await query(
        `INSERT INTO post_tags (post_id, tag_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [p.id, tagName]
      );
      insertedCounts.post_tags++;
    }
  }
}

// comments：mockData.comments 是 { postId: [comment,...] } 形式的 map
// 每条 comment 可能有 replies 嵌套，replies 的 parent_id 指向父评论 id
async function seedComments() {
  for (const [postId, list] of Object.entries(comments)) {
    for (const c of list) {
      // 插入父评论（parent_id 为 null）
      await query(
        `INSERT INTO comments (id, post_id, author_id, parent_id, content, likes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [c.id, postId, c.authorId, null, c.content, c.likes, c.createdAt]
      );
      insertedCounts.comments++;

      // 插入楼中楼回复，parent_id 指向父评论
      if (c.replies && c.replies.length > 0) {
        for (const r of c.replies) {
          await query(
            `INSERT INTO comments (id, post_id, author_id, parent_id, content, likes, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [r.id, postId, r.authorId, c.id, r.content, r.likes, r.createdAt]
          );
          insertedCounts.comments++;
        }
      }
    }
  }
}

// notifications：mockData 中隐含接收者为 currentUser
async function seedNotifications() {
  for (const n of notifications) {
    await query(
      `INSERT INTO notifications (id, user_id, type, title, body, read_at, created_at, target_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        n.id,
        currentUser.id,
        n.type,
        n.title,
        n.body,
        n.readAt,
        n.createdAt,
        n.targetId,
      ]
    );
    insertedCounts.notifications++;
  }
}

async function main() {
  const startTime = Date.now();
  try {
    console.log('🚀 开始导入种子数据...');

    // 1. 清空所有表（保证幂等）
    await truncateAll();
    console.log('🧹 已清空所有表');

    // 2. 按 FK 依赖顺序插入数据
    await seedUsers();
    console.log(`✓ users: ${insertedCounts.users} 行`);

    await seedUserStats();
    console.log(`✓ user_stats: ${insertedCounts.user_stats} 行`);

    await seedBoards();
    console.log(`✓ boards: ${insertedCounts.boards} 行`);

    await seedTopics();
    console.log(`✓ topics: ${insertedCounts.topics} 行`);

    await seedTags();
    console.log(`✓ tags: ${insertedCounts.tags} 行`);

    await seedPosts();
    console.log(`✓ posts: ${insertedCounts.posts} 行`);

    await seedPostTags();
    console.log(`✓ post_tags: ${insertedCounts.post_tags} 行`);

    await seedComments();
    console.log(`✓ comments: ${insertedCounts.comments} 行`);

    await seedNotifications();
    console.log(`✓ notifications: ${insertedCounts.notifications} 行`);

    const elapsed = Date.now() - startTime;
    console.log('──────────────────────────────');
    console.log(`✅ 种子数据导入完成，总耗时 ${elapsed}ms`);
  } catch (err) {
    console.error('❌ 种子数据导入失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    // 无论成功或失败都关闭连接池，避免进程挂起
    await pool.end();
  }
}

main();
