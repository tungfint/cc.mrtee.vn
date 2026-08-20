import { calculateCcLevel, calculateReward, round4 } from '@cc/core';
import { createDatabaseClient } from '@cc/database';
import { hashPassword } from './auth/password';

const USER_ID = 'de000000-0000-4000-8000-000000000800';
const ACCOUNT_ID = 'de000000-0000-4000-8000-000000000801';
const DEMO_EMAIL = process.env.DEMO_STUDENT_EMAIL?.trim().toLowerCase() || 'hocsinh.demo@mrtee.vn';
const DEMO_PASSWORD = process.env.DEMO_STUDENT_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const MASCOT_REWARD_ID = 'd0000000-0000-4000-8000-000000000001';
const STANDARD_REWARD_ID = 'd0000000-0000-4000-8000-000000000002';
const MASCOT_ORDER_ID = 'de000000-0000-4000-8000-000000000901';
const STANDARD_ORDER_ID = 'de000000-0000-4000-8000-000000000902';

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12) {
  throw new Error('DEMO_STUDENT_PASSWORD must contain at least 12 characters');
}

const policy = {
  level: {
    initialLevel: 800,
    gainMax: 4,
    gainScale: 100,
    maxPositiveDelta: 500,
  },
  reward: { min: 0.25, max: 12.5, midpointDelta: 50, scale: 120, maxPositiveDelta: 500 },
};
const ratings = [
  ...Array<number>(10).fill(800),
  ...Array<number>(10).fill(900),
  ...Array<number>(10).fill(1000),
  ...Array<number>(10).fill(1100),
  ...Array<number>(10).fill(1200),
];
const iso = (value: Date) => value.toISOString();

async function main() {
  const database = createDatabaseClient(DATABASE_URL!, 1);
  const passwordHash = await hashPassword(DEMO_PASSWORD!);
  try {
    const result = await database.connection.begin(async (transaction) => {
      const [emailOwner] = await transaction<{ user_id: string }[]>`
      SELECT user_id FROM user_credentials WHERE email = ${DEMO_EMAIL}
    `;
      if (emailOwner && emailOwner.user_id !== USER_ID) {
        throw new Error(`Email ${DEMO_EMAIL} is already assigned to another account`);
      }
      if (emailOwner?.user_id === USER_ID) {
        const [existing] = await transaction<
          {
            cc_level: string;
            cc_point: string;
            cc_balance: string;
            solves: number;
            reward_orders: number;
          }[]
        >`
        SELECT COALESCE(skill.cc_level, 800)::text AS cc_level,
          COALESCE(points.cc_point, 0)::text AS cc_point,
          COALESCE(wallet.balance, 0)::text AS cc_balance,
          (SELECT count(*)::int FROM user_problem_solves WHERE user_id = ${USER_ID}) AS solves,
          (SELECT count(*)::int FROM reward_orders WHERE user_id = ${USER_ID}) AS reward_orders
        FROM users
        LEFT JOIN user_skill_state AS skill ON skill.user_id = users.id
        LEFT JOIN user_wallets AS wallet ON wallet.user_id = users.id
        LEFT JOIN LATERAL (
          SELECT sum(amount) FILTER (WHERE type NOT IN ('REDEEM', 'REFUND')) AS cc_point
          FROM point_transactions WHERE user_id = users.id
        ) AS points ON true
        WHERE users.id = ${USER_ID}
      `;
        return {
          userId: USER_ID,
          email: DEMO_EMAIL,
          solves: existing?.solves ?? 0,
          ccLevel: Number(existing?.cc_level ?? 800),
          ccPoint: Number(existing?.cc_point ?? 0),
          ccBalance: Number(existing?.cc_balance ?? 0),
          streak: existing?.solves ?? 0,
          rewardOrders: existing?.reward_orders ?? 0,
          existing: true,
        };
      }

      await transaction`
      INSERT INTO users (
        id, full_name, display_name, status, system_role, leaderboard_visible, timezone
      ) VALUES (
        ${USER_ID}, 'Học Sinh Demo Cầy Cốt', 'Học Sinh Demo', 'ACTIVE', 'USER', true,
        'Asia/Ho_Chi_Minh'
      )
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        display_name = EXCLUDED.display_name,
        status = 'ACTIVE',
        system_role = 'USER',
        leaderboard_visible = true,
        timezone = EXCLUDED.timezone,
        updated_at = now()
    `;
      await transaction`
      INSERT INTO user_credentials (
        user_id, email, password_hash, must_change_password
      ) VALUES (${USER_ID}, ${DEMO_EMAIL}, ${passwordHash}, false)
      ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        must_change_password = false,
        failed_login_attempts = 0,
        locked_until = NULL,
        password_updated_at = now(),
        updated_at = now()
    `;

      await transaction`
      INSERT INTO rewards (
        id, name, description, cost, stock, active, image_url, category,
        required_cc_level, requires_approval
      ) VALUES
        (
          ${MASCOT_REWARD_ID}, 'Linh vật Cáo Hồng Công Nghệ',
          'Linh vật demo đã được chinh phục trong hành trình Cầy Cốt.',
          90, NULL, true, '/mascots/cao-hong-tan-binh.webp', 'MASCOT', 800, false
        ),
        (
          ${STANDARD_REWARD_ID}, 'Hộp quà Cầy Cốt Bí ẩn',
          'Phần quà demo nhận ngay khi học sinh đủ CC Balance.',
          60, NULL, true, '/brand/cay-code-logo.webp', 'STANDARD', 0, false
        )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        cost = EXCLUDED.cost,
        stock = EXCLUDED.stock,
        active = EXCLUDED.active,
        image_url = EXCLUDED.image_url,
        category = EXCLUDED.category,
        required_cc_level = EXCLUDED.required_cc_level,
        requires_approval = EXCLUDED.requires_approval,
        updated_at = now()
    `;
      await transaction`
      UPDATE reward_orders
      SET note = 'Dữ liệu demo quà đã nhận của S-Admin'
      WHERE id = 'd1000000-0000-4000-8000-000000000001'::uuid
    `;

      const today = new Date();
      today.setUTCHours(5, 0, 0, 0);
      const firstSolveAt = new Date(today.getTime() - (ratings.length - 1) * 86_400_000);
      const eligibleFrom = new Date(firstSolveAt.getTime() - 86_400_000);
      const finalSubmissionId = String(9_800_000_000_000 + ratings.length);
      await transaction`
      INSERT INTO codeforces_accounts (
        id, user_id, handle, current_rating, max_rating, rank, max_rank,
        verification_status, verified_at, reward_eligible_from, last_seen_submission_id,
        last_sync_at, next_sync_at, backfill_completed_at, sync_status, last_sync_error
      ) VALUES (
        ${ACCOUNT_ID}, ${USER_ID}, 'CayCot_Demo_800', 900, 1200, 'newbie', 'pupil',
        'ADMIN_VERIFIED', ${iso(eligibleFrom)}, ${iso(eligibleFrom)}, ${finalSubmissionId},
        now(), NULL, now(), 'INACTIVE',
        'Tài khoản minh họa nội bộ — không gọi đồng bộ Codeforces'
      )
    `;

      const solves: { problemKey: string; rating: number }[] = [];
      let currentLevel = 800;
      let calculatedLevel = 800;
      let masteryBonus = 0;
      let earnedTotal = 0;
      for (const [zeroIndex, rating] of ratings.entries()) {
        const index = zeroIndex + 1;
        const problemKey = `problemset:cay-cot-demo:D${String(index).padStart(2, '0')}`;
        const problemIndex = `D${String(index).padStart(2, '0')}`;
        const submissionId = String(9_800_000_000_000 + index);
        const solvedAt = new Date(firstSolveAt.getTime() + zeroIndex * 86_400_000);
        const levelBefore = currentLevel;
        const rewardReferenceLevelBefore = currentLevel;
        solves.push({ problemKey, rating });
        const nextLevel = calculateCcLevel(solves, policy.level);
        const reward = calculateReward(rating, rewardReferenceLevelBefore, policy.reward);
        currentLevel = nextLevel.level;
        calculatedLevel = nextLevel.calculated;
        masteryBonus = nextLevel.masteryBonus;
        earnedTotal = Math.round((earnedTotal + reward) * 100) / 100;
        const tag = rating <= 900 ? 'implementation' : rating <= 1000 ? 'math' : 'greedy';

        await transaction`
        INSERT INTO cf_problems (
          problem_key, problemset_name, problem_index, name, type, current_rating, tags
        ) VALUES (
          ${problemKey}, 'Cầy Cốt Demo', ${problemIndex},
          ${`Bài luyện tập minh họa ${rating} #${index}`}, 'PROGRAMMING', ${rating}, ${[tag]}
        )
        ON CONFLICT (problem_key) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          current_rating = EXCLUDED.current_rating,
          tags = EXCLUDED.tags,
          updated_at = now()
      `;
        await transaction`
        INSERT INTO cf_submissions (
          cf_submission_id, user_id, problem_key, creation_time, verdict,
          participant_type, is_team, programming_language, problem_rating_observed, raw_metadata
        ) VALUES (
          ${submissionId}, ${USER_ID}, ${problemKey}, ${iso(solvedAt)}, 'OK', 'PRACTICE', false,
          'GNU C++20', ${rating}, ${JSON.stringify({ demo: true })}::jsonb
        )
      `;
        await transaction`
        INSERT INTO user_problem_solves (
          user_id, problem_key, first_ok_submission_id, first_solved_at,
          rating_snapshot, reward_eligible
        ) VALUES (${USER_ID}, ${problemKey}, ${submissionId}, ${iso(solvedAt)}, ${rating}, true)
      `;
        await transaction`
        INSERT INTO point_transactions (
          user_id, type, amount, source_submission_id, idempotency_key,
          affects_wallet, affects_season, cc_level_before, problem_rating_snapshot,
          scoring_policy_version, description, metadata, event_at
        ) VALUES (
          ${USER_ID}, 'EARN', ${reward}, ${submissionId},
          ${`demo:student:solve:${index}`}, true, false, ${rewardReferenceLevelBefore}, ${rating}, 'v3.0',
          ${`Ghi nhận bài luyện tập minh họa rating ${rating}`},
          ${JSON.stringify({
            demo: true,
            displayCcLevelBefore: levelBefore,
            rewardReferenceLevelBefore,
            ccLevelAfter: nextLevel.level,
            ccLevelDelta: round4(nextLevel.level - levelBefore),
          })}::jsonb,
          ${iso(solvedAt)}
        )
      `;
      }

      const streakBonus = 25;
      earnedTotal = Math.round((earnedTotal + streakBonus) * 100) / 100;
      await transaction`
      INSERT INTO point_transactions (
        user_id, type, amount, idempotency_key, affects_wallet, affects_season,
        description, metadata, event_at
      ) VALUES (
        ${USER_ID}, 'BONUS', ${streakBonus}, 'demo:student:streak-bonus', true, false,
        'Thưởng minh họa mốc Streak 50 ngày', ${JSON.stringify({ demo: true })}::jsonb,
        ${iso(new Date(today.getTime() + 30_000))}
      )
    `;

      await transaction`
      INSERT INTO reward_orders (
        id, user_id, reward_id, cost_snapshot, status, idempotency_key,
        created_at, reviewed_at, note
      ) VALUES
        (
          ${MASCOT_ORDER_ID}, ${USER_ID}, ${MASCOT_REWARD_ID}, 90, 'FULFILLED',
          'demo:student:mascot-order', ${iso(new Date(today.getTime() + 60_000))},
          ${iso(new Date(today.getTime() + 60_000))}, 'Demo đổi linh vật tự động'
        ),
        (
          ${STANDARD_ORDER_ID}, ${USER_ID}, ${STANDARD_REWARD_ID}, 60, 'FULFILLED',
          'demo:student:standard-order', ${iso(new Date(today.getTime() + 120_000))},
          ${iso(new Date(today.getTime() + 120_000))}, 'Demo đổi quà tự động'
        )
    `;
      await transaction`
      INSERT INTO point_transactions (
        user_id, type, amount, source_reward_order_id, idempotency_key,
        affects_wallet, affects_season, description, metadata, event_at
      ) VALUES
        (
          ${USER_ID}, 'REDEEM', -90, ${MASCOT_ORDER_ID}, 'demo:student:mascot-redeem',
          true, false, 'Đổi Linh vật Cáo Hồng Công Nghệ',
          ${JSON.stringify({ demo: true })}::jsonb, ${iso(new Date(today.getTime() + 60_000))}
        ),
        (
          ${USER_ID}, 'REDEEM', -60, ${STANDARD_ORDER_ID}, 'demo:student:standard-redeem',
          true, false, 'Đổi Hộp quà Cầy Cốt Bí ẩn',
          ${JSON.stringify({ demo: true })}::jsonb, ${iso(new Date(today.getTime() + 120_000))}
        )
    `;

      const balance = Math.round((earnedTotal - 150) * 100) / 100;
      await transaction`
      INSERT INTO user_skill_state (
        user_id, cc_base, cc_calculated, cc_mastery_bonus, cc_level, scoring_policy_version
      ) VALUES (${USER_ID}, 800, ${calculatedLevel}, ${masteryBonus}, ${currentLevel}, 'v3.0')
      ON CONFLICT (user_id) DO UPDATE SET
        cc_base = 800,
        cc_calculated = EXCLUDED.cc_calculated,
        cc_mastery_bonus = EXCLUDED.cc_mastery_bonus,
        cc_level = EXCLUDED.cc_level,
        scoring_policy_version = 'v3.0',
        updated_at = now()
    `;
      await transaction`
      INSERT INTO user_wallets (user_id, balance) VALUES (${USER_ID}, ${balance})
      ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = now()
    `;
      await transaction`
      INSERT INTO audit_logs (action, entity_type, entity_id, after, reason)
      VALUES (
        'DEMO_STUDENT_SEEDED', 'USER', ${USER_ID},
        ${JSON.stringify({
          email: DEMO_EMAIL,
          solves: ratings.length,
          ccLevel: currentLevel,
          ccPoint: earnedTotal,
          ccBalance: balance,
          rewardOrders: 2,
        })}::jsonb,
        'Tạo lại dữ liệu học sinh demo chuẩn UTF-8 để kiểm thử đầy đủ hệ thống'
      )
    `;

      return {
        userId: USER_ID,
        email: DEMO_EMAIL,
        solves: ratings.length,
        ccLevel: currentLevel,
        ccPoint: earnedTotal,
        ccBalance: balance,
        streak: ratings.length,
        rewardOrders: 2,
      };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
