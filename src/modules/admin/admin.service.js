import db from "../../config/db.js";
import bcrypt from "bcrypt";

//adminlog
const logAdmin = async (conn, admin, action, entity, entityId, ip) => {

  if (!admin?.id || !admin?.email) {
    throw new Error("Invalid admin context");
  }

  if (!action)   throw new Error("action is required");
  if (!entity)   throw new Error("entity is required");
  if (!entityId) throw new Error("entityId is required");

  const [result] = await conn.query(
    `INSERT INTO admin_logs
     (admin_id, email, action, entity, entity_id, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      admin.id,
      admin.email,
      action,        
      entity,       
      entityId,
      ip || null
    ]
  );

  if (result.affectedRows === 0) {
    throw new Error("Failed to write admin log");
  }
};

//Employee

export const createAdmin = async (data, admin, ip) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── Bug #1 — Duplicate email check (Joi can't catch this) ──
    const [[existing]] = await conn.query(
      `SELECT id FROM admin WHERE email = ?`, [data.email]
    );
    if (existing) throw new Error("Admin with this email already exists");

    const hash = await bcrypt.hash(data.password, 12);

    const [result] = await conn.query(
      `INSERT INTO admin
       (name, email, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, 'active', NOW())`,
      [data.name, data.email.toLowerCase(), hash, data.role]
    );
    if (result.affectedRows === 0) throw new Error("Failed to create admin");
    if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

    await logAdmin(conn, admin, "CREATE_ADMIN", "admin", result.insertId, ip);
    await conn.commit();

    return {
      success: true,
      id: result.insertId,
      message: "Admin created successfully"
    };

  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

export const getAdmins = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT id, name, email, role, status, created_at
     FROM admin
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM admin`
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const getAdminById = async (id) => {
  if (!id || isNaN(Number(id))) throw new Error("Valid admin ID is required");

  const [[row]] = await db.query(
    `SELECT id, name, email, role, status, created_at 
     FROM admin 
     WHERE id = ?`,
    [Number(id)]
  );

  if (!row) throw new Error("Admin not found");
  return row;
};

export const updateAdmin = async (id, data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const ALLOWED_FIELDS = ["role", "status"];
  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");

  if (Number(id) === Number(admin.id)) {
    if (sanitized.role || sanitized.status) {
      throw new Error("Admins cannot update their own role or status");
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id FROM admin WHERE id = ?`, [id]
    );
    if (!existing) throw new Error("Admin not found");

    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    await conn.query(
      `UPDATE admin SET ${setClauses} WHERE id = ?`,
      [...setValues, id]
    );

    await logAdmin(conn, admin, "UPDATE_ADMIN", "admin", id, ip);
    await conn.commit();

    return {
      success: true,
      id: Number(id),
      message: "Admin updated successfully"
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//series

export const createSeries = async (data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT seriesid FROM series WHERE name = ? AND season = ?`,
      [data.name, data.season]
    );
    if (existing) throw new Error("Series with this name and season already exists");

    const [[{ nextSeriesId }]] = await conn.query(
      `SELECT IFNULL(MAX(seriesid), 0) + 1 AS nextSeriesId FROM series FOR UPDATE`
    );

    const [result] = await conn.query(
      `INSERT INTO series
       (seriesid, name, season, start_date, end_date, provider_series_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        nextSeriesId,
        data.name,
        data.season,
        data.start_date,
        data.end_date,
        data.provider_series_id || null
      ]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create series");
    await logAdmin(conn, admin, "CREATE_SERIES", "series", nextSeriesId, ip);
    await conn.commit();

    return { seriesid: nextSeriesId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
export const getSeries = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT
       seriesid,
       name,
       season,
       start_date,
       end_date,
       provider_series_id,
       created_at
     FROM series
     ORDER BY start_date DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM series`
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};
export const getSeriesById = async (id) => {

  if (!id || isNaN(Number(id))) throw new Error("Valid series ID is required");

  const [[row]] = await db.query(
    `SELECT
       seriesid,
       name,
       season,
       start_date,
       end_date,
       provider_series_id,
       created_at
     FROM series
     WHERE seriesid = ?`,
    [Number(id)]
  );

  if (!row) throw new Error("Series not found");
  return row;
};

export const updateSeries = async (id, data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");
  const ALLOWED_FIELDS = ["name", "season", "start_date", "end_date"];

  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT seriesid, start_date, end_date FROM series WHERE seriesid = ?`,
      [id]
    );
    if (!existing) throw new Error("Series not found");
    const resolvedStartDate = sanitized.start_date ?? existing.start_date;
    const resolvedEndDate   = sanitized.end_date   ?? existing.end_date;

    if (new Date(resolvedEndDate) <= new Date(resolvedStartDate)) {
      throw new Error("end_date must be greater than start_date");
    }
    if (sanitized.name || sanitized.season) {
      const [[duplicate]] = await conn.query(
        `SELECT seriesid FROM series
         WHERE name = ? AND season = ? AND seriesid != ?`,
        [
          sanitized.name   ?? existing.name,
          sanitized.season ?? existing.season,
          id
        ]
      );
      if (duplicate) throw new Error("Series with this name and season already exists");
    }

    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    await conn.query(
      `UPDATE series SET ${setClauses} WHERE seriesid = ?`,
      [...setValues, id]
    );

    await logAdmin(conn, admin, "UPDATE_SERIES", "series", id, ip);
    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//match
export const createMatch = async (data, admin, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const {
    series_id,
    home_team_id,
    away_team_id,
    start_time,
    matchdate,
    contests = [],
  } = data;

  // ── Basic validations ─────────────────────────────────────────────────────
  if (Number(home_team_id) === Number(away_team_id))
    throw new Error("Home and away teams must be different");

  if (!contests.length)
    throw new Error("At least one contest category must be selected");

  for (const c of contests) {
    if (!c.category_id)
      throw new Error("Each contest must have a category_id");
    if (!c.max_entries || Number(c.max_entries) < 2)
      throw new Error(`Contest category ${c.category_id}: max_entries must be at least 2`);

    // ── NEW: validate prize_distribution if provided ──────────────────────
    if (c.prize_distribution?.length) {
      for (const pd of c.prize_distribution) {
        const amount = Number(pd.amount);
        if (isNaN(amount) || amount <= 0)
          throw new Error(`Contest category ${c.category_id}: all prize amounts must be > 0`);
        if (pd.rank !== undefined && Number(pd.rank) <= 0)
          throw new Error(`Contest category ${c.category_id}: rank must be a positive integer`);
        if (pd.rank_from !== undefined && pd.rank_to !== undefined) {
          if (pd.rank_to <= pd.rank_from)
            throw new Error(`Contest category ${c.category_id}: rank_to must be greater than rank_from`);
        }
      }
    }
  }

  // Guard against duplicate category_ids in the same request
  const uniqueCategoryIds = [...new Set(contests.map((c) => Number(c.category_id)))];
  if (uniqueCategoryIds.length !== contests.length)
    throw new Error("Duplicate category_id entries found in contests array");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── Validate series ───────────────────────────────────────────────────
    const [[series]] = await conn.query(
      `SELECT seriesid, name AS seriesname FROM series WHERE seriesid = ?`,
      [series_id]
    );
    if (!series) throw new Error("Invalid series_id — series not found");

    // ── Validate teams ────────────────────────────────────────────────────
    const [[homeTeam]] = await conn.query(
      `SELECT id, name AS teamname FROM teams WHERE id = ?`,
      [home_team_id]
    );
    if (!homeTeam) throw new Error("Invalid home_team_id — team not found");

    const [[awayTeam]] = await conn.query(
      `SELECT id, name AS teamname FROM teams WHERE id = ?`,
      [away_team_id]
    );
    if (!awayTeam) throw new Error("Invalid away_team_id — team not found");

    // ── Duplicate match check ─────────────────────────────────────────────
    const [[existing]] = await conn.query(
      `SELECT id FROM matches
       WHERE series_id    = ?
         AND home_team_id = ?
         AND away_team_id = ?
         AND matchdate    = ?
         AND start_time   = ?`,
      [series_id, home_team_id, away_team_id, matchdate, start_time]
    );
    if (existing)
      throw new Error("A match with the same teams, series, time and date already exists");

    // ── Fetch selected contest categories ─────────────────────────────────
    const [categories] = await conn.query(
      `SELECT id, name, entryfee, platformfee,
              percentage AS winner_percentage
       FROM contestcategory
       WHERE id IN (?)`,
      [uniqueCategoryIds]
    );

    if (categories.length !== uniqueCategoryIds.length) {
      const foundIds   = categories.map((c) => Number(c.id));
      const missingIds = uniqueCategoryIds.filter((id) => !foundIds.includes(id));
      throw new Error(`Contest categories not found: ${missingIds.join(", ")}`);
    }

    // ── Create match ──────────────────────────────────────────────────────
    const [matchResult] = await conn.query(
      `INSERT INTO matches
         (series_id, seriesname,
          home_team_id, hometeamname,
          away_team_id, awayteamname,
          matchdate, start_time,
          status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPCOMING', NOW())`,
      [
        series_id,    series.seriesname,
        home_team_id, homeTeam.teamname,
        away_team_id, awayTeam.teamname,
        matchdate,    start_time,
      ]
    );
    if (matchResult.affectedRows === 0) throw new Error("Failed to create match");
    const matchId = matchResult.insertId;

    // ── Create contests ───────────────────────────────────────────────────
    const createdContests = [];

    for (const input of contests) {
      // Number() on both sides — DB returns id as number, request may send as string
      const category = categories.find((c) => Number(c.id) === Number(input.category_id));
      if (!category) throw new Error(`Category ${input.category_id} not found`);

      // ── Values from category + admin input ───────────────────────────
      const max_entries             = Number(input.max_entries);
      const entry_fee               = Number(category.entryfee);
      const platform_fee_percentage = Number(category.platformfee);      // e.g. 10 = 10%
      const winner_percentage       = Number(category.winner_percentage); // e.g. 20 = 20% of players win
      const is_guaranteed           = input.is_guaranteed ? 1 : 0;
      const is_cashback             = 1;
      const cashback_percentage     = Number(category.winner_percentage || 0); // from category directly
      const min_entries             = 2;

      // ── Math ─────────────────────────────────────────────────────────
      const prize_pool        = max_entries * entry_fee;                                   // total collected
      const platformFeeAmount = (prize_pool * platform_fee_percentage) / 100;             // platform cut
      const netAfterFee       = prize_pool - platformFeeAmount;                           // after platform fee
      const totalWinners      = Math.floor((max_entries * winner_percentage) / 100);      // winning players
      const totalLosers       = max_entries - totalWinners;                               // losers only get cashback
      const cashbackPerUser   = is_cashback ? entry_fee : 0;                             // per user cashback
      const totalCashback     = is_cashback ? cashbackPerUser * totalWinners : 0;         // cashback for losers only
      const netPrizePool      = Math.max(0, netAfterFee - totalCashback);                // final prize pool

      // ── NEW: prize_distribution — accept from input or null ──────────
      const prizeDistribution = input.prize_distribution?.length
        ? JSON.stringify(input.prize_distribution)
        : null;

      // ── NEW: first_prize — rank 1 amount from distribution, else full net pool
      let first_prize;
      if (input.prize_distribution?.length) {
        // supports both { rank: 1, amount } and { rank_from: 1, rank_to: X, amount }
        const rankOne = input.prize_distribution.find(
          (p) => p.rank === 1 ||
                 (p.rank_from !== undefined && p.rank_from <= 1 && p.rank_to >= 1)
        );
        first_prize = rankOne ? Number(rankOne.amount) : netPrizePool;
      } else {
        first_prize = netPrizePool; // original behaviour — full pool, distribution set later
      }

      // ── INSERT — column order unchanged ──────────────────────────────
      await conn.query(
        `INSERT INTO contest
           (match_id, contest_type, entry_fee,
            prize_pool, net_pool_prize,
            max_entries, min_entries, current_entries,
            is_guaranteed, winner_percentage, total_winners,
            first_prize, prize_distribution,
            is_cashback, cashback_percentage, cashback_amount,
            platform_fee_percentage, platform_fee_amount,
            status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [
          matchId,
          category.name,
          entry_fee,
          Number(prize_pool.toFixed(2)),          // prize_pool     = total collected
          Number(netPrizePool.toFixed(2)),         // net_pool_prize = after fee & cashback
          max_entries,
          min_entries,
          0,                                       // current_entries starts at 0
          is_guaranteed,
          winner_percentage,
          totalWinners,
          Number(first_prize.toFixed(2)),          // ← NEW: rank 1 amount or full net pool
          prizeDistribution,                       // ← NEW: JSON string or NULL
          is_cashback,
          Number(cashback_percentage.toFixed(2)),  // from category directly
          Number(cashbackPerUser.toFixed(2)),      // per-user cashback amount
          platform_fee_percentage,
          Number(platformFeeAmount.toFixed(2)),
          "UPCOMING",
        ]
      );

      createdContests.push({
        category:              category.name,
        max_entries,
        min_entries,
        entry_fee,
        platform_fee_percentage,
        platform_fee_amount:   Number(platformFeeAmount.toFixed(2)),
        prize_pool:            Number(prize_pool.toFixed(2)),
        net_prize_pool:        Number(netPrizePool.toFixed(2)),
        winner_percentage,
        total_winners:         totalWinners,
        is_guaranteed,
        is_cashback,
        cashback_percentage:   Number(cashback_percentage.toFixed(2)),
        cashback_amount:       Number(cashbackPerUser.toFixed(2)),
        first_prize:           Number(first_prize.toFixed(2)),          // ← NEW
        prize_distribution:    input.prize_distribution ?? null,        // ← NEW
      });
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await logAdmin(conn, admin, "CREATE_MATCH", "match", matchId, ip || null);
    await conn.commit();

    return {
      success:  true,
      match_id: matchId,
      contests: createdContests,
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const createMatchcontastold = async (data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const { series_id, home_team_id, away_team_id, start_time,matchdate } = data;
  if (Number(home_team_id) === Number(away_team_id)) {
    throw new Error("Home and away teams must be different");
  }
console.log("DATA RECEIVED:", data);
console.log("start_time:", start_time);
console.log("matchdate:", matchdate);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[series]] = await conn.query(
      `SELECT seriesid FROM series WHERE seriesid = ?`, [series_id]
    );
      const [[seriename]] = await conn.query(
      `SELECT name AS seriesname FROM series WHERE seriesid = ?`,
      [series_id]
    );
    if (!series) throw new Error("Invalid series_id — series not found");

    const [[homeTeam]] = await conn.query(
      `SELECT id FROM teams WHERE id = ?`, [home_team_id]
    );
      const [[homeTeamname]] = await conn.query(
      `SELECT name AS teamname FROM teams WHERE id = ?`,
      [home_team_id]
    );
    if (!homeTeam) throw new Error("Invalid home_team_id — team not found");

    const [[awayTeam]] = await conn.query(
      `SELECT id FROM teams WHERE id = ?`, [away_team_id]
    );
     const [[awayTeamname]] = await conn.query(
      `SELECT name AS teamname FROM teams WHERE id = ?`,
      [away_team_id]
    );
    if (!awayTeam) throw new Error("Invalid away_team_id — team not found");

     const [[existing]] = await conn.query(
      `SELECT id FROM matches
       WHERE series_id = ?
       AND home_team_id = ?
       AND away_team_id = ?
       AND start_time = ?
       AND matchdate = ?`,
      [
        series_id,
        home_team_id,
        away_team_id,
          start_time,
          matchdate
      ]
    );

    if (existing) {
      throw new Error("A match with the same teams, series, time and date already exists");
    }

    // const [result] = await conn.query(
    //   `INSERT INTO matches
    //    (series_id, home_team_id, away_team_id, start_time, matchdate, status, created_at)
    //    VALUES (?, ?, ?, ?, ?, 'UPCOMING', NOW())`,
    //   [
    //     series_id,
    //     home_team_id,
    //     away_team_id,
    //    start_time,
    //       matchdate
    //   ]
    // );
    const [result] = await conn.query(
  `INSERT INTO matches
   (series_id, seriesname,
    home_team_id, hometeamname,
    away_team_id, awayteamname,
    matchdate, start_time,
    status, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'UPCOMING', NOW())`,
  [
    series_id,
    seriename.seriesname,
    home_team_id,
    homeTeamname.teamname,
    away_team_id,
    awayTeamname.teamname,
    matchdate,
   start_time
   
  ]
);
    if (result.affectedRows === 0) throw new Error("Failed to create match");

    const matchId = result.insertId;

    // ── Auto-create contests for all categories ──────────────
    const [categories] = await conn.query(
      `SELECT id, name, entryfee, platformfee,percentage FROM contestcategory`
    );

    if (!categories.length) throw new Error("No contest categories found — cannot auto-create contests");

    for (const category of categories) {
      await conn.query(
        `INSERT INTO contest
          (match_id, contest_type, entry_fee, platform_fee_percentage,
           prize_pool, net_pool_prize, max_entries, min_entries, current_entries,
           is_guaranteed, winner_percentage, total_winners,
           first_prize, prize_distribution,
           is_cashback, cashback_percentage, cashback_amount,
           platform_fee_amount, status, created_at)
         VALUES (?,?,?,?,0,0,0,0,0,0,?,0,0,null,0,0,0,0,'UPCOMING',NOW())`,
        [matchId, category.name, category.entryfee, category.platformfee,category.percentage]
      );
    }
    // ─────────────────────────────────────────────────────────

    await logAdmin(conn, admin, "CREATE_MATCH", "match", matchId, ip || null);
    await conn.commit();

    return { id: matchId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const createMatchold = async (data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const { series_id, home_team_id, away_team_id, start_time } = data;
  if (Number(home_team_id) === Number(away_team_id)) {
    throw new Error("Home and away teams must be different");
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[series]] = await conn.query(
      `SELECT seriesid FROM series WHERE seriesid = ?`,
      [series_id]
    );
  
    
    if (!series) throw new Error("Invalid series_id — series not found");

    const [[homeTeam]] = await conn.query(
      `SELECT id FROM teams WHERE id = ?`,
      [home_team_id]
    );
   
    if (!homeTeam) throw new Error("Invalid home_team_id — team not found");

    const [[awayTeam]] = await conn.query(
      `SELECT id FROM teams WHERE id = ?`,
      [away_team_id]
    );
    
   
    if (!awayTeam) throw new Error("Invalid away_team_id — team not found");

    const [[existing]] = await conn.query(
      `SELECT id FROM matches
       WHERE series_id = ? AND home_team_id = ? AND away_team_id = ? AND start_time = ?`,
      [series_id, home_team_id, away_team_id, new Date(start_time)]
    );
    if (existing) throw new Error("A match with the same teams, series, and time already exists");
    const [result] = await conn.query(
      `INSERT INTO matches
       (series_id, home_team_id, away_team_id, start_time, status, created_at)
       VALUES (?, ?, ?, ?, 'UPCOMING', NOW())`,
      [series_id, home_team_id, away_team_id, new Date(start_time)]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create match");
    await logAdmin(conn, admin, "CREATE_MATCH", "match", result.insertId, ip || null);
    await conn.commit();

    return { id: result.insertId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


const VALID_STATUSES = ["UPCOMING", "LIVE", "INREVIEW", "COMPLETED", "ABANDONED"];
const MATCH_COLUMNS = `
  m.id,
  m.series_id,
  m.home_team_id,
  m.away_team_id,
  m.start_time,
  m.status,
  m.created_at,
  s.name        AS series_name,
  ht.name       AS home_team_name,
  at.name       AS away_team_name
`;

export const getMatches = async ({ page = 1, limit = 20, status = null } = {}) => {
  const offset = (page - 1) * limit;

  if (status && !VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(", ")}`);
  }

  const whereClause = status ? `WHERE m.status = ?` : ``;
  const queryParams = status
    ? [limit, offset]
    : [limit, offset];

  const [rows] = await db.query(
    `SELECT ${MATCH_COLUMNS}
     FROM matches m
     JOIN series s  ON s.seriesid = m.series_id
     JOIN teams  ht ON ht.id      = m.home_team_id
     JOIN teams  at ON at.id      = m.away_team_id
     ${whereClause}
     ORDER BY m.start_time DESC
     LIMIT ? OFFSET ?`,
    status ? [status, limit, offset] : [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM matches m ${whereClause}`,
    status ? [status] : []
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};


export const getMatchById = async (id) => {

  if (!id || isNaN(Number(id))) throw new Error("Valid match ID is required");

  const [[row]] = await db.query(
    `SELECT ${MATCH_COLUMNS}
     FROM matches m
     JOIN series s  ON s.seriesid = m.series_id
     JOIN teams  ht ON ht.id      = m.home_team_id
     JOIN teams  at ON at.id      = m.away_team_id
     WHERE m.id = ?`,
    [Number(id)]
  );

  if (!row) throw new Error("Match not found");
  return row;
};


export const getMatchBySeries = async (seriesId, { page = 1, limit = 20, status = null } = {}) => {

  if (!seriesId || isNaN(Number(seriesId))) throw new Error("Valid series ID is required");

  if (status && !VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(", ")}`);
  }

  const offset     = (page - 1) * limit;
  const conditions = status
    ? `WHERE m.series_id = ? AND m.status = ?`
    : `WHERE m.series_id = ?`;

  const baseParams = status ? [Number(seriesId), status] : [Number(seriesId)];

  const [rows] = await db.query(
    `SELECT ${MATCH_COLUMNS}
     FROM matches m
     JOIN series s  ON s.seriesid = m.series_id
     JOIN teams  ht ON ht.id      = m.home_team_id
     JOIN teams  at ON at.id      = m.away_team_id
     ${conditions}
     ORDER BY m.start_time ASC
     LIMIT ? OFFSET ?`,
    [...baseParams, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM matches m ${conditions}`,
    baseParams
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};


export const updateMatch = async (id, data, admin, ip) => {

  const ALLOWED_FIELDS = ["start_time", "status", "series_id", "home_team_id", "away_team_id"];

  const VALID_TRANSITIONS = {
    UPCOMING:  ["LIVE", "ABANDONED"],
    LIVE:      ["INREVIEW", "ABANDONED"],
    INREVIEW:  ["COMPLETED", "ABANDONED"],
    COMPLETED: [],   // terminal
    ABANDONED: [],   // terminal
  };

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");
  if (sanitized.start_time !== undefined) {
    sanitized.start_time = new Date(sanitized.start_time);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[match]] = await conn.query(
      `SELECT id, status, home_team_id, away_team_id, start_time
       FROM matches
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    if (!match) throw new Error("Match not found");

    if (VALID_TRANSITIONS[match.status].length === 0) {
      throw new Error(
        `Match is already ${match.status} — no further updates are allowed`
      );
    }
    if (sanitized.status && sanitized.status !== match.status) {
      const allowed = VALID_TRANSITIONS[match.status];
      if (!allowed.includes(sanitized.status)) {
        throw new Error(
          `Cannot transition from ${match.status} to ${sanitized.status}. ` +
          `Allowed: ${allowed.join(", ")}`
        );
      }
    }
    const resolvedHome = Number(sanitized.home_team_id ?? match.home_team_id);
    const resolvedAway = Number(sanitized.away_team_id ?? match.away_team_id);
    if (resolvedHome === resolvedAway) {
      throw new Error("Home and away teams must be different");
    }

    if (sanitized.series_id !== undefined) {
      const [[series]] = await conn.query(
        `SELECT seriesid FROM series WHERE seriesid = ?`,
        [sanitized.series_id]
      );
      if (!series) throw new Error("Invalid series_id — series not found");
    }

    if (sanitized.home_team_id !== undefined) {
      const [[homeTeam]] = await conn.query(
        `SELECT id FROM teams WHERE id = ?`,
        [sanitized.home_team_id]
      );
      if (!homeTeam) throw new Error("Invalid home_team_id — team not found");
    }

    if (sanitized.away_team_id !== undefined) {
      const [[awayTeam]] = await conn.query(
        `SELECT id FROM teams WHERE id = ?`,
        [sanitized.away_team_id]
      );
      if (!awayTeam) throw new Error("Invalid away_team_id — team not found");
    }

    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    const [result] = await conn.query(
      `UPDATE matches SET ${setClauses} WHERE id = ?`,
      [...setValues, id]
    );

    if (result.changedRows === 0) {
      await conn.rollback();
      return {
        success: true,
        id: Number(id),
        message: "No changes were made — values are identical to current data"
      };
    }
    await logAdmin(conn, admin, "UPDATE_MATCH", "match", Number(id), ip || null);
    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


//teams

export const createTeam = async (data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT id FROM teams WHERE name = ?`,
      [data.name]
    );
    if (existing) throw new Error("Team with this name already exists");
    const [result] = await conn.query(
      `INSERT INTO teams (name, short_name) VALUES (?, ?)`,
      [data.name, data.short_name.toUpperCase()]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create team");

    await logAdmin(conn, admin, "CREATE_TEAM", "team", result.insertId, ip);
    await conn.commit();

    return { id: result.insertId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getTeams = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT
       id,
       name,
       short_name,
       created_at
     FROM teams
     ORDER BY name ASC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM teams`
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};


export const getTeamById = async (id) => {
  if (!id || isNaN(Number(id))) throw new Error("Valid team ID is required");

  const [[row]] = await db.query(
    `SELECT
       id,
       name,
       short_name,
       created_at
     FROM teams
     WHERE id = ?`,
    [Number(id)]
  );

  if (!row) throw new Error("Team not found");
  return row;
};

export const updateTeam = async (id, data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");
  const ALLOWED_FIELDS = ["name", "short_name"];

  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");
  if (sanitized.short_name) {
    sanitized.short_name = sanitized.short_name.toUpperCase();
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT id, name, short_name FROM teams WHERE id = ?`,
      [id]
    );
    if (!existing) throw new Error("Team not found");
    if (sanitized.name && sanitized.name !== existing.name) {
      const [[duplicate]] = await conn.query(
        `SELECT id FROM teams WHERE name = ? AND id != ?`,
        [sanitized.name, id]
      );
      if (duplicate) throw new Error("Team with this name already exists");
    }
    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    const [result] = await conn.query(
      `UPDATE teams SET ${setClauses} WHERE id = ?`,
      [...setValues, id]
    );
    if (result.changedRows === 0) {
      await conn.rollback();
      return;
    }
    await logAdmin(conn, admin, "UPDATE_TEAM", "team", id, ip || null);
    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//players
export const createPlayer = async (data, admin, ip) => {
  console.log("createPlayer data:", data);
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  
  if (data.points === undefined || data.points === null) throw new Error("points is required");
  if (data.playercredits === undefined || data.playercredits === null) throw new Error("playercredits is required");
  if (isNaN(Number(data.points))) throw new Error("points must be a valid number");
  if (isNaN(Number(data.playercredits))) throw new Error("playercredits must be a valid number");
  const points        = Number(data.points);
  const playercredits = Number(data.playercredits);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[team]] = await conn.query(
      `SELECT id FROM teams WHERE id = ?`,
      [data.team_id]
    );
    if (!team) throw new Error("Invalid team_id — team not found");

    const [[existing]] = await conn.query(
      `SELECT id FROM players WHERE name = ? AND team_id = ?`,
      [data.name, data.team_id]
    );
    if (existing) throw new Error("Player already exists in this team");

    const [result] = await conn.query(
      `INSERT INTO players
       (team_id, name, position, points, playercredits, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [data.team_id, data.name, data.position, points, playercredits]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create player");

    await logAdmin(conn, admin, "CREATE_PLAYER", "player", result.insertId, ip || null);
    await conn.commit();

    return { id: result.insertId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
const VALID_POSITIONS = ["GK", "DEF", "MID", "FWD"];
const PLAYER_COLUMNS = `
  p.id,
  p.team_id,
  p.name,
  p.position,
  p.points,
  p.playercredits,
  p.created_at,
  t.name       AS team_name,
  t.short_name AS team_short_name
`;

export const getPlayers = async ({ page = 1, limit = 20, position = null } = {}) => {
  const offset = (page - 1) * limit;

  if (position && !VALID_POSITIONS.includes(position)) {
    throw new Error(`Invalid position. Allowed: ${VALID_POSITIONS.join(", ")}`);
  }

  const whereClause = position ? `WHERE p.position = ?` : ``;

  const [rows] = await db.query(
    `SELECT ${PLAYER_COLUMNS}
     FROM players p
     JOIN teams t ON t.id = p.team_id
     ${whereClause}
     ORDER BY p.name ASC
     LIMIT ? OFFSET ?`,
    position ? [position, limit, offset] : [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM players p ${whereClause}`,
    position ? [position] : []
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};


export const getPlayerById = async (id) => {
  if (!id || isNaN(Number(id))) throw new Error("Valid player ID is required");

  const [[row]] = await db.query(
    `SELECT ${PLAYER_COLUMNS}
     FROM players p
     JOIN teams t ON t.id = p.team_id
     WHERE p.id = ?`,
    [Number(id)]
  );

  if (!row) throw new Error("Player not found");
  return row;
};


export const getPlayerByTeam = async (teamId, { page = 1, limit = 20, position = null } = {}) => {

  if (!teamId || isNaN(Number(teamId))) throw new Error("Valid team ID is required");
  if (position && !VALID_POSITIONS.includes(position)) {
    throw new Error(`Invalid position. Allowed: ${VALID_POSITIONS.join(", ")}`);
  }

  const offset = (page - 1) * limit;

  const conditions = position
    ? `WHERE p.team_id = ? AND p.position = ?`
    : `WHERE p.team_id = ?`;

  const baseParams = position
    ? [Number(teamId), position]
    : [Number(teamId)];

  const [rows] = await db.query(
    `SELECT ${PLAYER_COLUMNS}
     FROM players p
     JOIN teams t ON t.id = p.team_id
     ${conditions}
     ORDER BY p.position ASC, p.name ASC
     LIMIT ? OFFSET ?`,
    [...baseParams, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM players p ${conditions}`,
    baseParams
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const updatePlayer = async (id, data, admin, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");
  const ALLOWED_FIELDS = ["name", "position", "points", "playercredits", "team_id"];

  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT id, name, team_id FROM players WHERE id = ?`,
      [id]
    );
    if (!existing) throw new Error("Player not found");
    if (sanitized.team_id !== undefined) {
      const [[team]] = await conn.query(
        `SELECT id FROM teams WHERE id = ?`,
        [sanitized.team_id]
      );
      if (!team) throw new Error("Invalid team_id — team not found");
    }
    if (sanitized.name && sanitized.name !== existing.name) {
      const resolvedTeamId = sanitized.team_id ?? existing.team_id;
      const [[duplicate]] = await conn.query(
        `SELECT id FROM players WHERE name = ? AND team_id = ? AND id != ?`,
        [sanitized.name, resolvedTeamId, id]
      );
      if (duplicate) throw new Error("Player with this name already exists in this team");
    }
    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    const [result] = await conn.query(
      `UPDATE players SET ${setClauses} WHERE id = ?`,
      [...setValues, id]
    );
    if (result.changedRows === 0) {
      await conn.rollback();
      return;
    }
    await logAdmin(conn, admin, "UPDATE_PLAYER", "player", id, ip || null);
    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//contest

export const createContestold = async (data, admin, ip) => {

  // ── Validate admin context ────────────────────────────────
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[match]] = await conn.query(
      `SELECT id, status FROM matches WHERE id = ?`,
      [data.match_id]
    );
    if (!match) throw new Error("Invalid match_id — match not found");

    if (match.status !== "UPCOMING") {
      throw new Error(
        `Contests can only be created for UPCOMING matches — match is currently ${match.status}`
      );
    }

    const [[category]] = await conn.query(
      `SELECT id FROM contestcategory WHERE name = ?`,
      [data.contest_type]
    );
    if (!category) throw new Error(`Invalid contest_type — '${data.contest_type}' not found in contest categories`);

    const [[existing]] = await conn.query(
      `SELECT id FROM contest WHERE match_id = ? AND q = ?`,
      [data.match_id, data.contest_type]
    );
    if (existing) throw new Error(`Contest type '${data.contest_type}' already exists for this match`);

    const defaults = {
      prize_pool:          0,
      net_pool_prize:      0,
      max_entries:         0,
      min_entries:         0,
      current_entries:     0,
      is_guaranteed:       0,
      winner_percentage:   0,
      total_winners:       0,
      first_prize:         0,
      prize_distribution:  null,
      is_cashback:         0,
      cashback_percentage: 0,
      cashback_amount:     0,
      platform_fee_amount: 0,
    };

    const [result] = await conn.query(
      `INSERT INTO contest
        (match_id, contest_type, entry_fee, platform_fee_percentage,
         prize_pool, net_pool_prize, max_entries, min_entries, current_entries,
         is_guaranteed, winner_percentage, total_winners,
         first_prize, prize_distribution,
         is_cashback, cashback_percentage, cashback_amount,
         platform_fee_amount, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        data.match_id,
        data.contest_type,
        data.entry_fee,
        data.platform_fee_percentage,
        defaults.prize_pool,
        defaults.net_pool_prize,
        defaults.max_entries,
        defaults.min_entries,
        defaults.current_entries,
        defaults.is_guaranteed,
        defaults.winner_percentage,
        defaults.total_winners,
        defaults.first_prize,
        defaults.prize_distribution,
        defaults.is_cashback,
        defaults.cashback_percentage,
        defaults.cashback_amount,
        defaults.platform_fee_amount,
        data.status ?? "UPCOMING",
      ]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create contest");

    await logAdmin(conn, admin, "CREATE_CONTEST", "contest", result.insertId, ip || null);
    await conn.commit();

    return { id: result.insertId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const createContestol = async (data, admin, ip) => {

  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[match]] = await conn.query(
      `SELECT id, status FROM matches WHERE id = ?`,
      [data.match_id]
    );
    if (!match) throw new Error("Invalid match_id — match not found");
    if (match.status !== "UPCOMING") {
      throw new Error(
        `Contests can only be created for UPCOMING matches — match is currently ${match.status}`
      );
    }

    const [[category]] = await conn.query(
      `SELECT id FROM contestcategory WHERE name = ?`,
      [data.contest_type]
    );
    if (!category) throw new Error(`Invalid contest_type — '${data.contest_type}' not found`);
    const [[existing]] = await conn.query(
      `SELECT id FROM contest WHERE match_id = ? AND contest_type = ?`,
      [data.match_id, data.contest_type]
    );
    if (existing) throw new Error(`Contest type '${data.contest_type}' already exists for this match`);
    const totalCollected     = data.max_entries * data.entry_fee;
    const platformFeeAmount  = (totalCollected * (data.platform_fee_percentage ?? 0)) / 100;
    const netAfterFee        = totalCollected - platformFeeAmount;
    const totalWinners       = Math.floor((data.max_entries * (data.winner_percentage ?? 0)) / 100);
    const cashbackAmount     = data.is_cashback ? data.entry_fee : 0;
    const cashbackPercentage = totalCollected > 0
      ? (cashbackAmount / totalCollected) * 100
      : 0;
    const netPrizePool       = netAfterFee - cashbackAmount;

    const prizeDistribution  = data.prize_distribution
      ? JSON.stringify(data.prize_distribution)
      : null;
    const [result] = await conn.query(
      `INSERT INTO contest
       (match_id, contest_type, entry_fee,
        prize_pool, net_pool_prize,
        max_entries, min_entries, current_entries,
        is_guaranteed, winner_percentage, total_winners,
        first_prize, prize_distribution,
        is_cashback, cashback_percentage, cashback_amount,
        platform_fee_percentage, platform_fee_amount,
        status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        data.match_id,
        data.contest_type,
        data.entry_fee,
        netPrizePool,                          
        netAfterFee,
        data.max_entries,
        data.min_entries     ?? 0,
        0,                                     
        data.is_guaranteed   ?? 0,
        data.winner_percentage ?? 0,
        totalWinners,                          
        data.first_prize     ?? 0,
        prizeDistribution,
        data.is_cashback     ?? 0,
        cashbackPercentage,                    
        cashbackAmount,                        
        data.platform_fee_percentage ?? 0,
        platformFeeAmount,                     
        data.status          ?? "UPCOMING",
      ]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create contest");
    await logAdmin(conn, admin, "CREATE_CONTEST", "contest", result.insertId, ip || null);
    await conn.commit();

    return { id: result.insertId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const createContest = async (data, admin, ip) => {
  if (!admin?.id || !admin?.email) {
    throw new Error("Invalid admin context");
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    const [[match]] = await conn.query(
      `SELECT id, status FROM matches WHERE id = ?`,
      [data.match_id]
    );

    if (!match) throw new Error("Match not found");
    if (match.status !== "UPCOMING") {
      throw new Error(`Match must be UPCOMING`);
    }
    const [[category]] = await conn.query(
      `SELECT name, entryfee, platformfee, percentage AS winner_percentage
       FROM contestcategory WHERE name = ?`,
      [data.contest_type]
    );

    if (!category) throw new Error("Invalid contest_type");

    
    const [[existing]] = await conn.query(
      `SELECT id FROM contest WHERE match_id = ? AND contest_type = ?`,
      [data.match_id, category.name]
    );

    if (existing) throw new Error("Contest already exists");

    const max_entries = parseInt(data.max_entries);
    if (!max_entries || max_entries < 2) {
      throw new Error("max_entries must be >= 2");
    }

    const entry_fee = Number(category.entryfee);
    const platform_fee_percentage = Number(category.platformfee);
    const winner_percentage = Number(category.winner_percentage);
    const prize_pool = max_entries * entry_fee;

    const platformFeeAmount =
      (prize_pool * platform_fee_percentage) / 100;

    const netAfterFee = prize_pool - platformFeeAmount;

    const totalWinners = Math.floor(
      (max_entries * winner_percentage) / 100
    );

    const refundStart = Math.floor(totalWinners * 0.01);
    const bonusRanks = refundStart - 1;

    const refundWinners = totalWinners - bonusRanks;

    const totalRefund = refundWinners * entry_fee;

    const bonusPool = Math.max(0, netAfterFee - totalRefund);

    if (!data.prize_distribution) {
      throw new Error("prize_distribution is required");
    }

   let parsedDistribution;

if (Array.isArray(data.prize_distribution)) {
  parsedDistribution = data.prize_distribution;

} else if (typeof data.prize_distribution === "object") {
  parsedDistribution = Object.entries(data.prize_distribution).map(
    ([key, amount]) => ({
      rank: parseInt(key.replace(/\D/g, "")),
      amount: Number(amount),
    })
  );

} else {
  throw new Error("Invalid prize_distribution format");
}

  
    let coveredRanks = 0;

    const totalBonusDistributed = parsedDistribution.reduce((sum, p) => {
      if (p.rank) {
        coveredRanks += 1;
        return sum + Number(p.amount);
      }

      if (p.rank_from && p.rank_to) {
        const count = p.rank_to - p.rank_from + 1;
        coveredRanks += count;
        return sum + count * Number(p.amount);
      }

      throw new Error("Invalid prize_distribution format");
    }, 0);

    if ((coveredRanks !== bonusRanks)&&(bonusRanks>0)) {
      throw new Error(
        `Distribution mismatch: covers ${coveredRanks}, expected ${bonusRanks}`
      );
    }

    if (totalBonusDistributed > bonusPool) {
  const scale = bonusPool / totalBonusDistributed;

  parsedDistribution = parsedDistribution.map(p => {
    if (p.rank) {
      return { ...p, amount: Math.floor(p.amount * scale) };
    }

    if (p.rank_from && p.rank_to) {
      return { ...p, amount: Math.floor(p.amount * scale) };
    }

    return p;
  });
} 
    if (totalBonusDistributed > bonusPool) {
      throw new Error(
        `Bonus exceeds pool: ${totalBonusDistributed} > ${bonusPool}`
      );
    }

    const rankOne = parsedDistribution.find(
      (p) =>
        p.rank === 1 ||
        (p.rank_from && p.rank_from <= 1 && p.rank_to >= 1)
    );

    const first_prize = rankOne
      ? Number(rankOne.amount)
      : 0;

    const [result] = await conn.query(
      `INSERT INTO contest
       (match_id, contest_type, entry_fee,
        prize_pool,netpool_amount, net_pool_prize,
        max_entries, current_entries,
        winner_percentage, total_winners,
        first_prize, prize_distribution,
        refund_start_rank, bonus_ranks, refund_winners, refund_total,
        platform_fee_percentage, platform_fee_amount,
        status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        data.match_id,
        category.name,
        entry_fee,
        prize_pool,
        netAfterFee,
        bonusPool,
        max_entries,
        0,
        winner_percentage,
        totalWinners,
        first_prize,
        JSON.stringify(parsedDistribution),

        refundStart,
        bonusRanks,
        refundWinners,
        totalRefund,

        platform_fee_percentage,
        platformFeeAmount,
        data.status ?? "UPCOMING",
      ]
    );

    await conn.commit();

    return {
      success: true,
      id: result.insertId,
      details: {
        bonusPool,
        first_prize,
        totalBonusDistributed,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const createContests = async (data, admin, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");


  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── Validate match ────────────────────────────────────────────────────
    const [[match]] = await conn.query(
      `SELECT id, status FROM matches WHERE id = ?`,
      [data.match_id]
    );
    if (!match) throw new Error("Invalid match_id — match not found");
    if (match.status !== "UPCOMING")
      throw new Error(`Contests can only be created for UPCOMING matches — match is currently ${match.status}`);

    // ── Validate contest category by name ─────────────────────────────────
    const [[category]] = await conn.query(
      `SELECT id, name, entryfee, platformfee,
              percentage AS winner_percentage
       FROM contestcategory WHERE name = ?`,
      [data.contest_type]
    );
    if (!category) throw new Error(`Invalid contest_type — '${data.contest_type}' not found`);

    // ── Duplicate check ───────────────────────────────────────────────────
    const [[existing]] = await conn.query(
      `SELECT id FROM contest WHERE match_id = ? AND contest_type = ?`,
      [data.match_id, category.name]
    );
    if (existing)
      throw new Error(`Contest type '${category.name}' already exists for this match`);

    // ── Coerce numerics ───────────────────────────────────────────────────
    const max_entries             = parseInt(data.max_entries)         || 0;
    const entry_fee               = Number(category.entryfee)          || 0;
    const platform_fee_percentage = Number(category.platformfee)       || 0;
    const winner_percentage       = Number(category.winner_percentage)  || 0;
    const is_guaranteed           = data.is_guaranteed ? 1 : 0;
    const is_cashback             = 1;
    const cashback_percentage     = Number(category.winner_percentage   || 0);
    const min_entries             = 2;

    if (!max_entries || max_entries < 2)
      throw new Error("max_entries must be at least 2");

    // ── Math ──────────────────────────────────────────────────────────────
    const prize_pool        = max_entries * entry_fee;
    const platformFeeAmount = (prize_pool * platform_fee_percentage) / 100;
    const netAfterFee       = prize_pool - platformFeeAmount;
    const totalWinners      = Math.floor((max_entries * winner_percentage) / 100);
    const cashbackPerUser   = is_cashback ? entry_fee : 0;
    const totalCashback     = is_cashback ? cashbackPerUser * totalWinners : 0;
    const netPrizePool      = Math.max(0, netAfterFee - totalCashback);

    // ── prize_distribution — support BOTH array and object formats ────────
    let parsedDistribution = null;

    if (data.prize_distribution) {
      if (Array.isArray(data.prize_distribution)) {
        // [ { rank: 1, amount: 40 }, ... ]
        parsedDistribution = data.prize_distribution;
      } else if (typeof data.prize_distribution === "object") {
        // { "rank1": 40, "rank2": 30, ... }
        parsedDistribution = Object.entries(data.prize_distribution).map(([key, amount]) => ({
          rank:   parseInt(key.replace(/\D/g, "")),
          amount: Number(amount),
        }));
      }
    }

    // ── Validate prize_distribution entries ───────────────────────────────
    if (parsedDistribution?.length) {
      for (const pd of parsedDistribution) {
        const amount = Number(pd.amount);
        if (isNaN(amount) || amount <= 0)
          throw new Error(`All prize amounts must be > 0`);
        if (pd.rank !== undefined && Number(pd.rank) <= 0)
          throw new Error(`Rank must be a positive integer`);
        if (pd.rank_from !== undefined && pd.rank_to !== undefined) {
          if (pd.rank_to <= pd.rank_from)
            throw new Error(`rank_to must be greater than rank_from`);
        }
      }
    }

    const prizeDistribution = parsedDistribution?.length
      ? JSON.stringify(parsedDistribution)
      : null;

    // ── first_prize ───────────────────────────────────────────────────────
    let first_prize;
    if (parsedDistribution?.length) {
      const rankOne = parsedDistribution.find(
        (p) => p.rank === 1 ||
               (p.rank_from !== undefined && p.rank_from <= 1 && p.rank_to >= 1)
      );
      first_prize = rankOne ? Number(rankOne.amount) : netPrizePool;
    } else {
      first_prize = netPrizePool;
    }

    // ── INSERT ────────────────────────────────────────────────────────────
    const [result] = await conn.query(
      `INSERT INTO contest
         (match_id, contest_type, entry_fee,
          prize_pool, net_pool_prize,
          max_entries, min_entries, current_entries,
          is_guaranteed, winner_percentage, total_winners,
          first_prize, prize_distribution,
          is_cashback, cashback_percentage, cashback_amount,
          platform_fee_percentage, platform_fee_amount,
          status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        data.match_id,
        category.name,
        entry_fee,
        Number(prize_pool.toFixed(2)),
        Number(netPrizePool.toFixed(2)),
        max_entries,
        min_entries,
        0,
        is_guaranteed,
        winner_percentage,
        totalWinners,
        Number(first_prize.toFixed(2)),
        prizeDistribution,
        is_cashback,
        Number(cashback_percentage.toFixed(2)),
        Number(cashbackPerUser.toFixed(2)),
        platform_fee_percentage,
        Number(platformFeeAmount.toFixed(2)),
        data.status ?? "UPCOMING",
      ]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create contest");

    await logAdmin(conn, admin, "CREATE_CONTEST", "contest", result.insertId, ip || null);
    await conn.commit();

    return {
      success: true,
      id:      result.insertId,
      details: {
        category:            category.name,
        max_entries,
        min_entries,
        entry_fee,
        platform_fee_percentage,
        platform_fee_amount: Number(platformFeeAmount.toFixed(2)),
        prize_pool:          Number(prize_pool.toFixed(2)),
        net_prize_pool:      Number(netPrizePool.toFixed(2)),
        winner_percentage,
        total_winners:       totalWinners,
        is_guaranteed,
        is_cashback,
        cashback_percentage: Number(cashback_percentage.toFixed(2)),
        cashback_amount:     Number(cashbackPerUser.toFixed(2)),
        first_prize:         Number(first_prize.toFixed(2)),
        prize_distribution:  parsedDistribution ?? null,
      },
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
// MATCH_STATUSES  : UPCOMING, LIVE, INREVIEW, COMPLETED, ABANDONED
// CONTEST_STATUSES: UPCOMING, LIVE, FULL,     COMPLETED, CANCELLED
const CONTEST_STATUSES = ["UPCOMING", "LIVE", "FULL", "COMPLETED", "CANCELLED"];
const CONTEST_COLUMNS = `
  c.id,
  c.match_id,
  c.contest_type,
  c.entry_fee,
  c.prize_pool,
  c.net_pool_prize,
  c.max_entries,
  c.min_entries,
  c.current_entries,
  c.is_guaranteed,
  c.winner_percentage,
  c.total_winners,
  c.first_prize,
  c.prize_distribution,
  c.is_cashback,
  c.cashback_percentage,
  c.cashback_amount,
  c.platform_fee_percentage,
  c.platform_fee_amount,
  c.status,
  c.created_at,
  m.start_time      AS match_start_time,
  m.status          AS match_status,
  ht.name           AS home_team_name,
  ht.short_name     AS home_team_short,
  at.name           AS away_team_name,
  at.short_name     AS away_team_short,
  s.name            AS series_name
`;
const CONTEST_JOINS = `
  JOIN matches m  ON m.id       = c.match_id
  JOIN teams   ht ON ht.id      = m.home_team_id
  JOIN teams   at ON at.id      = m.away_team_id
  JOIN series  s  ON s.seriesid = m.series_id
`;

export const getContests = async ({ page = 1, limit = 20, status = null } = {}) => {
  const offset = (page - 1) * limit;

  if (status && !CONTEST_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${CONTEST_STATUSES.join(", ")}`);
  }

  const whereClause = status ? `WHERE c.status = ?` : ``;

  const [rows] = await db.query(
    `SELECT ${CONTEST_COLUMNS}
     FROM contest c
     ${CONTEST_JOINS}
     ${whereClause}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    status ? [status, limit, offset] : [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM contest c ${whereClause}`,
    status ? [status] : []
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const getContestById = async (id) => {

  if (!id || isNaN(Number(id))) throw new Error("Valid contest ID is required");

  const [[row]] = await db.query(
    `SELECT ${CONTEST_COLUMNS}
     FROM contest c
     ${CONTEST_JOINS}
     WHERE c.id = ?`,
    [Number(id)]
  );

  if (!row) throw new Error("Contest not found");
  return row;
};

export const getContestsByMatch = async (matchId, { page = 1, limit = 20, status = null } = {}) => {

  if (!matchId || isNaN(Number(matchId))) throw new Error("Valid match ID is required");

  if (status && !CONTEST_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${CONTEST_STATUSES.join(", ")}`);
  }

  const offset     = (page - 1) * limit;
  const conditions = status
    ? `WHERE c.match_id = ? AND c.status = ?`
    : `WHERE c.match_id = ?`;
  const baseParams = status ? [Number(matchId), status] : [Number(matchId)];

  const [rows] = await db.query(
    `SELECT ${CONTEST_COLUMNS}
     FROM contest c
     ${CONTEST_JOINS}
     ${conditions}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...baseParams, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM contest c ${conditions}`,
    baseParams
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const getContestsBySeries = async (seriesId, { page = 1, limit = 20, status = null } = {}) => {

  if (!seriesId || isNaN(Number(seriesId))) throw new Error("Valid series ID is required");

  if (status && !CONTEST_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${CONTEST_STATUSES.join(", ")}`);
  }

  const offset     = (page - 1) * limit;
  const conditions = status
    ? `WHERE m.series_id = ? AND c.status = ?`
    : `WHERE m.series_id = ?`;
  const baseParams = status ? [Number(seriesId), status] : [Number(seriesId)];

  const [rows] = await db.query(
    `SELECT ${CONTEST_COLUMNS}
     FROM contest c
     ${CONTEST_JOINS}
     ${conditions}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...baseParams, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
     FROM contest c
     ${CONTEST_JOINS}
     ${conditions}`,
    baseParams
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const getContestsByStatus = async (status, { page = 1, limit = 20 } = {}) => {

  if (!status || !CONTEST_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${CONTEST_STATUSES.join(", ")}`);
  }

  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT ${CONTEST_COLUMNS}
     FROM contest c
     ${CONTEST_JOINS}
     WHERE c.status = ?
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [status, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM contest c WHERE c.status = ?`,
    [status]
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const getContestsByTeam = async (teamId, { page = 1, limit = 20, status = null } = {}) => {

  if (!teamId || isNaN(Number(teamId))) throw new Error("Valid team ID is required");

  if (status && !CONTEST_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${CONTEST_STATUSES.join(", ")}`);
  }

  const offset     = (page - 1) * limit;
  const conditions = status
    ? `WHERE (m.home_team_id = ? OR m.away_team_id = ?) AND c.status = ?`
    : `WHERE (m.home_team_id = ? OR m.away_team_id = ?)`;
  const baseParams = status
    ? [Number(teamId), Number(teamId), status]
    : [Number(teamId), Number(teamId)];

  const [rows] = await db.query(
    `SELECT DISTINCT ${CONTEST_COLUMNS}
     FROM contest c
     ${CONTEST_JOINS}
     ${conditions}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...baseParams, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(DISTINCT c.id) AS total
     FROM contest c
     ${CONTEST_JOINS}
     ${conditions}`,
    baseParams
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

const CONTEST_TRANSITIONS = {
  UPCOMING:  ["LIVE", "FULL", "CANCELLED"],
  LIVE:      ["FULL", "COMPLETED", "CANCELLED"],
  FULL:      ["LIVE", "COMPLETED", "CANCELLED"],  // can go back to LIVE if slot opens
  COMPLETED: [],   // terminal
  CANCELLED: [],   // terminal
};

export const updateContest = async (id, data, admin, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const contestId = parseInt(id, 10);
  if (isNaN(contestId)) throw new Error("Invalid contest ID");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[contest]] = await conn.query(
      `SELECT * FROM contest WHERE id = ? FOR UPDATE`,
      [contestId]
    );
    if (!contest) throw new Error("Contest not found");
    if (CONTEST_TRANSITIONS[contest.status].length === 0) {
      throw new Error(
        `Contest is already ${contest.status} — no further updates are allowed`
      );
    }
    if (data.status && data.status !== contest.status) {
      const allowed = CONTEST_TRANSITIONS[contest.status];
      if (!allowed.includes(data.status)) {
        throw new Error(
          `Cannot transition contest from ${contest.status} to ${data.status}. ` +
          `Allowed: ${allowed.join(", ")}`
        );
      }
    }
    if (data.contest_type && data.contest_type !== contest.contest_type) {
      const [[category]] = await conn.query(
        `SELECT id FROM contestcategory WHERE contest_type = ?`,
        [data.contest_type]
      );
      if (!category) throw new Error(`Invalid contest_type — '${data.contest_type}' not found`);
    }
    const merged = {
      entry_fee:               Number(data.entry_fee               ?? contest.entry_fee),
      max_entries:             Number(data.max_entries             ?? contest.max_entries),
      min_entries:             Number(data.min_entries             ?? contest.min_entries),
      platform_fee_percentage: Number(data.platform_fee_percentage ?? contest.platform_fee_percentage),
      winner_percentage:       Number(data.winner_percentage       ?? contest.winner_percentage),
      first_prize:             Number(data.first_prize             ?? contest.first_prize),
      is_guaranteed:           Number(data.is_guaranteed           ?? contest.is_guaranteed),
      is_cashback:             Number(data.is_cashback             ?? contest.is_cashback),
      contest_type:            data.contest_type ?? contest.contest_type,
      status:                  data.status       ?? contest.status,
      prize_distribution:      data.prize_distribution !== undefined
                                 ? data.prize_distribution
                                 : contest.prize_distribution,
    };

    const totalCollected    = merged.max_entries * merged.entry_fee;
    const platformFeeAmount = (totalCollected * merged.platform_fee_percentage) / 100;
    const netAfterFee       = totalCollected - platformFeeAmount;
    const totalWinners      = Math.floor((merged.max_entries * merged.winner_percentage) / 100);

    const cashbackAmount    = merged.is_cashback ? merged.entry_fee : 0;
    const cashbackPercentage = totalCollected > 0
      ? (cashbackAmount / totalCollected) * 100
      : 0;

    const netPrizePool = Math.max(0, netAfterFee - cashbackAmount);

    const prizeDistribution = merged.prize_distribution
      ? (typeof merged.prize_distribution === "object"
          ? JSON.stringify(merged.prize_distribution)
          : merged.prize_distribution)
      : null;
    const [result] = await conn.query(
      `UPDATE contest SET
        entry_fee               = ?,
        max_entries             = ?,
        min_entries             = ?,
        contest_type            = ?,
        platform_fee_percentage = ?,
        platform_fee_amount     = ?,
        winner_percentage       = ?,
        total_winners           = ?,
        prize_pool              = ?,
        net_pool_prize          = ?,
        is_cashback             = ?,
        cashback_percentage     = ?,
        cashback_amount         = ?,
        first_prize             = ?,
        prize_distribution      = ?,
        is_guaranteed           = ?,
        status                  = ?
       WHERE id = ?`,
      [
        merged.entry_fee,
        merged.max_entries,
        merged.min_entries,
        merged.contest_type,
        merged.platform_fee_percentage,
        platformFeeAmount,
        merged.winner_percentage,
        totalWinners,
        netPrizePool,
        netAfterFee,
        merged.is_cashback,
        cashbackPercentage,
        cashbackAmount,
        merged.first_prize,
        prizeDistribution,
        merged.is_guaranteed,
        merged.status,
        contestId,
      ]
    );

    if (result.affectedRows === 0) throw new Error("Contest update failed");

    await logAdmin(conn, admin, "UPDATE_CONTEST", "contest", contestId, ip || null);
    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


//contest category

export const createContestCategory = async (data, admin, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT id FROM contestcategory WHERE name = ?`,
      [data.name]
    );
    if (existing) throw new Error("Contest category with this name already exists");

    const [result] = await conn.query(
      `INSERT INTO contestcategory
       (name, percentage, entryfee, platformfee, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [
        data.name,
        data.percentage  ?? 0,
        data.entryfee    ?? 0,
        data.platformfee ?? 0,
      ]
    );

    if (result.affectedRows === 0) throw new Error("Failed to create contest category");

    await logAdmin(conn, admin, "CREATE_CONTEST_CATEGORY", "contestcategory", result.insertId, ip || null);
    await conn.commit();

    return { id: result.insertId };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getContestCategories = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT
       id,
       name,
       percentage,
       entryfee,
       platformfee,
       created_at
     FROM contestcategory
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM contestcategory`
  );

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};


export const updateContestCategory = async (id, data, admin, ip) => {
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");

  if (!id || isNaN(Number(id))) throw new Error("Valid category ID is required");
  const ALLOWED_FIELDS = ["name", "percentage", "entryfee", "platformfee"];

  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT id, name FROM contestcategory WHERE id = ?`,
      [Number(id)]
    );
    if (!existing) throw new Error("Contest category not found");
    if (sanitized.name && sanitized.name !== existing.name) {
      const [[duplicate]] = await conn.query(
        `SELECT id FROM contestcategory WHERE name = ? AND id != ?`,
        [sanitized.name, Number(id)]
      );
      if (duplicate) throw new Error("Contest category with this name already exists");
    }

    const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(sanitized);

    const [result] = await conn.query(
      `UPDATE contestcategory SET ${setClauses} WHERE id = ?`,
      [...setValues, Number(id)]
    );

    if (result.changedRows === 0) {
      await conn.rollback();
      return;
    }

    await logAdmin(conn, admin, "UPDATE_CONTEST_CATEGORY", "contestcategory", Number(id), ip || null);
    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


// ── Dashboard ─────────────────────────────────────────────────
export const getHomeservice = async () => {

  const [[userStats]] = await db.query(`
    SELECT
      COUNT(*)                                          AS totalRegistered,
      SUM(phoneverify = 1 AND email = 1)                AS activeUsers,
      SUM(iskycverify = 1)                              AS kycVerified,
      SUM(iskycverify = 0)                              AS notKycVerified
    FROM users
  `);

  const [[walletStats]] = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN wallettype IN ('deposit','subscribe','entry_fee') THEN amount END), 0) AS totalAmountReceived,
      COALESCE(SUM(CASE WHEN wallettype = 'withdraw' THEN amount END), 0)                           AS totalWithdrawAmount
    FROM wallet_transactions
  `);

  const [[matchStats]] = await db.query(`
    SELECT
      SUM(status = 'LIVE')      AS liveMatches,
      SUM(status = 'UPCOMING')  AS launchedMatches,
      SUM(status = 'COMPLETED') AS completedMatches,
      SUM(status = 'INREVIEW')  AS reviewMatches,
      SUM(status = 'ABANDONED') AS cancelledMatches
    FROM matches
  `);

  const [[withdrawStats]] = await db.query(`
    SELECT
      SUM(status = 'pending')  AS pendingWithdrawRequests,
      SUM(status = 'approved') AS approvedWithdrawRequests,
      SUM(status = 'rejected') AS rejectedWithdrawRequests
    FROM withdraws
  `);

  const [[teamStats]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM teams)             AS totalTeams,
      (SELECT COUNT(*) FROM players)           AS totalPlayers,
      (SELECT COUNT(*) FROM user_teams)        AS totalUserTeams,
      (SELECT COUNT(*) FROM user_team_players) AS totalUserTeamPlayers
  `);

  const [contests] = await db.query(`
    SELECT
      c.id,
      c.created_at,
      c.contest_type,
      c.max_entries,
      c.current_entries,
      c.status,
      ht.name AS home_team_name,
      at.name AS away_team_name
    FROM contest c
    LEFT JOIN matches m  ON m.id  = c.match_id
    LEFT JOIN teams   ht ON ht.id = m.home_team_id
    LEFT JOIN teams   at ON at.id = m.away_team_id
    ORDER BY c.created_at DESC
    LIMIT 10
  `);

  const { liveMatches, launchedMatches, completedMatches, reviewMatches, cancelledMatches } = matchStats;
  const { pendingWithdrawRequests, approvedWithdrawRequests, rejectedWithdrawRequests }     = withdrawStats;

  return {
    users: {
      totalRegistered: Number(userStats.totalRegistered),
      activeUsers:     Number(userStats.activeUsers),
      kycVerified:     Number(userStats.kycVerified),
      notKycVerified:  Number(userStats.notKycVerified),
    },
    wallet: {
      totalAmountReceived: Number(walletStats.totalAmountReceived),
      totalWithdrawAmount: Number(walletStats.totalWithdrawAmount),
    },
    matches: {
      live:      Number(liveMatches),
      launched:  Number(launchedMatches),
      completed: Number(completedMatches),
      inReview:  Number(reviewMatches),
      cancelled: Number(cancelledMatches),
      total:     Number(liveMatches) + Number(launchedMatches) + Number(completedMatches) + Number(reviewMatches) + Number(cancelledMatches),
    },
    withdrawRequests: {
      pending:  Number(pendingWithdrawRequests),
      approved: Number(approvedWithdrawRequests),
      rejected: Number(rejectedWithdrawRequests),
      total:    Number(pendingWithdrawRequests) + Number(approvedWithdrawRequests) + Number(rejectedWithdrawRequests),
    },
    teams: {
      totalTeams:   Number(teamStats.totalTeams),
      totalPlayers: Number(teamStats.totalPlayers),
    },
    userTeams: {
      totalUserTeams:       Number(teamStats.totalUserTeams),
      totalUserTeamPlayers: Number(teamStats.totalUserTeamPlayers),
    },
    recentContests: contests,
  };
};


// ── Deposits ──────────────────────────────────────────────────
const DEPOSIT_COLUMNS = `
  id, userId, amount, depositeType,
  status, transaction_id, phone,
  createdAt
`;

export const getallDeposites = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT ${DEPOSIT_COLUMNS}
     FROM deposite
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM deposite`
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const fetchDeposites = async (filters = {}, { page = 1, limit = 20 } = {}) => {
  const { depositeType, status, minAmount, maxAmount, phone, startDate, endDate, transaction_id } = filters;

  const conditions = [];
  const params     = [];

  if (depositeType?.trim())   { conditions.push(`depositeType = ?`);   params.push(depositeType.trim()); }
  if (status?.trim())         { conditions.push(`status = ?`);         params.push(status.trim()); }
  if (phone?.trim())          { conditions.push(`phone = ?`);          params.push(phone.trim()); }
  if (transaction_id?.trim()) { conditions.push(`transaction_id = ?`); params.push(transaction_id.trim()); }
  if (minAmount !== undefined && minAmount !== '') { conditions.push(`amount >= ?`); params.push(Number(minAmount)); }
  if (maxAmount !== undefined && maxAmount !== '') { conditions.push(`amount <= ?`); params.push(Number(maxAmount)); }
  if (startDate?.trim())      { conditions.push(`createdAt >= ?`);     params.push(new Date(startDate.trim())); }
  if (endDate?.trim())        { conditions.push(`createdAt <= ?`);     params.push(new Date(endDate.trim())); }

  const offset      = (page - 1) * limit;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ``;

  const [rows] = await db.query(
    `SELECT ${DEPOSIT_COLUMNS}
     FROM deposite ${whereClause}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM deposite ${whereClause}`,
    params
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const fetchDepositesSummary = async () => {
  const [rows] = await db.query(`
    SELECT status, SUM(amount) AS totalAmount, COUNT(*) AS totalCount
    FROM deposite
    GROUP BY status
    HAVING status IN ('pending', 'success', 'failed', 'refund')
    ORDER BY status
  `);

  const summary = {
    pending: { totalAmount: 0, totalCount: 0 },
    success: { totalAmount: 0, totalCount: 0 },
    failed:  { totalAmount: 0, totalCount: 0 },
    refund:  { totalAmount: 0, totalCount: 0 },
  };

  rows.forEach(({ status, totalAmount, totalCount }) => {
    summary[status] = { totalAmount: Number(totalAmount), totalCount: Number(totalCount) };
  });

  return summary;
};


// ── Withdraws ─────────────────────────────────────────────────

// ── Explicit withdraw columns (no SELECT *) ───────────────────
const WITHDRAW_COLUMNS = `
  id, user_id, amount, payment_mode,
  status, transaction_id, phone,
  createdAt
`;

export const getallWithdraws = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT ${WITHDRAW_COLUMNS}
     FROM withdraws
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM withdraws`
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const fetchWithdraws = async (filters = {}, { page = 1, limit = 20 } = {}) => {
  const { payment_mode, status, minAmount, maxAmount, phone, startDate, endDate, transaction_id } = filters;

  const conditions = [];
  const params     = [];

  if (payment_mode?.trim())   { conditions.push(`payment_mode = ?`);   params.push(payment_mode.trim()); }
  if (status?.trim())         { conditions.push(`status = ?`);         params.push(status.trim()); }
  if (phone?.trim())          { conditions.push(`phone = ?`);          params.push(phone.trim()); }
  if (transaction_id?.trim()) { conditions.push(`transaction_id = ?`); params.push(transaction_id.trim()); }
  if (minAmount !== undefined && minAmount !== '') { conditions.push(`amount >= ?`); params.push(Number(minAmount)); }
  if (maxAmount !== undefined && maxAmount !== '') { conditions.push(`amount <= ?`); params.push(Number(maxAmount)); }
  if (startDate?.trim())      { conditions.push(`createdAt >= ?`);     params.push(new Date(startDate.trim())); }
  if (endDate?.trim())        { conditions.push(`createdAt <= ?`);     params.push(new Date(endDate.trim())); }

  const offset      = (page - 1) * limit;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ``;

  const [rows] = await db.query(
    `SELECT ${WITHDRAW_COLUMNS}
     FROM withdraws ${whereClause}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM withdraws ${whereClause}`,
    params
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const fetchWithdrawsSummary = async () => {
  const [rows] = await db.query(`
    SELECT status, SUM(amount) AS totalAmount, COUNT(*) AS totalCount
    FROM withdraws
    GROUP BY status
    HAVING status IN ('pending', 'approved', 'rejected')
    ORDER BY status
  `);

  const summary = {
    pending:  { totalAmount: 0, totalCount: 0 },
    approved: { totalAmount: 0, totalCount: 0 },
    rejected: { totalAmount: 0, totalCount: 0 },
  };

  rows.forEach(({ status, totalAmount, totalCount }) => {
    summary[status] = { totalAmount: Number(totalAmount), totalCount: Number(totalCount) };
  });

  return summary;
};



export const adminWithdrawActionService = async (withdrawId, data) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const { action, reason } = data;

    const [[withdraw]] = await conn.query(
      `SELECT id, user_id, amount, status
       FROM withdraws
       WHERE id = ?
       FOR UPDATE`,
      [withdrawId]
    );

    if (!withdraw) throw new Error("Withdraw request not found");

    if (withdraw.status !== "PENDING") {
      throw new Error("Withdraw request already processed");
    }

    if (action === "APPROVE") {
      await conn.query(
        `UPDATE withdraws
         SET status = 'APPROVED',
             approved_at = NOW()
         WHERE id = ?`,
        [withdrawId]
      );
    }

    if (action === "REJECT") {
      // refund wallet
      await conn.query(
        `UPDATE wallets
         SET earnwallet = earnwallet + ?
         WHERE user_id = ?`,
        [withdraw.amount, withdraw.user_id]
      );

      await conn.query(
        `UPDATE withdraws
         SET status = 'REJECTED',
             reject_reason = ?,
             rejected_at = NOW()
         WHERE id = ?`,
        [reason, withdrawId]
      );
    }

    await conn.commit();

    return {
      success: true,
      message:
        action === "APPROVE"
          ? "Withdrawal approved successfully"
          : "Withdrawal rejected and wallet refunded",
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── Users ─────────────────────────────────────────────────────

const USER_COLUMNS = `
  id, name, email, mobile, referalid,
  usercode, phoneverify, iskycverify,
  account_status,userid, kyc_status, created_at
`;

export const getallUsers = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM users`
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const fetchUsers = async (filters = {}, { page = 1, limit = 20 } = {}) => {
  const { name, usercode, email, mobile, account_status, kyc_status, userid, referalid } = filters;

  const conditions = [];
  const params     = [];

  if (userid)                 { conditions.push(`id = ?`);             params.push(Number(userid)); }
  if (referalid)              { conditions.push(`referalid = ?`);      params.push(Number(referalid)); }
  if (name?.trim())           { conditions.push(`name LIKE ?`);        params.push(`%${name.trim()}%`); }
  if (email?.trim())          { conditions.push(`email = ?`);          params.push(email.trim()); }
  if (mobile?.trim())         { conditions.push(`mobile = ?`);         params.push(mobile.trim()); }
  if (usercode?.trim())       { conditions.push(`usercode = ?`);       params.push(usercode.trim()); }
  if (account_status?.trim()) { conditions.push(`account_status = ?`); params.push(account_status.trim()); }
  if (kyc_status?.trim())     { conditions.push(`kyc_status = ?`);     params.push(kyc_status.trim()); }

  const offset      = (page - 1) * limit;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ``;

  const [rows] = await db.query(
    `SELECT ${USER_COLUMNS}
     FROM users ${whereClause}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM users ${whereClause}`,
    params
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const fetchUsersByKycStatus = async (filters = {}, { page = 1, limit = 20 } = {}) => {
  const { kyc_status } = filters;

  if (!kyc_status?.trim()) throw new Error("kyc_status is required");

  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE kyc_status = ?
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [kyc_status.trim(), limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM users WHERE kyc_status = ?`,
    [kyc_status.trim()]
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const fetchUsersByAccountStatus = async (filters = {}, { page = 1, limit = 20 } = {}) => {
  const { account_status } = filters;

  if (!account_status?.trim()) throw new Error("account_status is required");

  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE account_status = ?
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [account_status.trim(), limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM users WHERE account_status = ?`,
    [account_status.trim()]
  );

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};


async function getCompanyBalance(conn) {
  const [[row]] = await conn.query(
    `SELECT closing_balance
     FROM wallet_transactions
     WHERE closing_balance != 0
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`
  );
  return Number(row?.closing_balance || 0);
}

// ── Approve ──────────────────────────────────────────────────────────────────
export const approveWithdrawService = async (adminId, withdrawId, body) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { transaction_id, remarks = "" } = body;
    if (!transaction_id) throw new Error("transaction_id is required");

    // 1. Lock & fetch withdrawal (with snapshots)
    const [[withdraw]] = await conn.query(
      `SELECT w.*, u.name AS username, u.email, u.mobile AS phone
       FROM withdraws w
       JOIN users u ON u.id = w.user_id
       WHERE w.id = ?
       FOR UPDATE`,
      [withdrawId]
    );
    if (!withdraw)
      throw new Error("Withdrawal request not found");
    if (withdraw.status !== "PENDING")
      throw new Error(`Withdrawal is already ${withdraw.status.toLowerCase()}`);

    const amount = parseFloat(withdraw.amount);

    // 2. Use the balance snapshot captured at request time
    //    (wallet was already debited — these values are correct)
    const userOpening = Number(withdraw.snapshot_opening);
    const userClosing = Number(withdraw.snapshot_closing);

    // 3. Company balance
    const companyOpening = await getCompanyBalance(conn);
    const companyClosing = Number((companyOpening - amount).toFixed(2));

    // 4. Mark APPROVED
    await conn.query(
      `UPDATE withdraws
       SET status = 'APPROVED', transaction_id = ?, processed_at = NOW()
       WHERE id = ?`,
      [transaction_id, withdrawId]
    );

    // 5. Approval audit log
    await conn.query(
      `INSERT INTO withdraw_approvals
         (withdrawal_id, admin_id, status, remarks, created_at)
       VALUES (?, ?, 'approved', ?, NOW())`,
      [withdrawId, adminId, remarks]
    );

    // 6. Wallet transaction — debit (money physically leaves company)
    await conn.query(
      `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark,
          amount,
          useropeningbalance, userclosingbalance,
          opening_balance,    closing_balance,
          reference_id)
       VALUES (?, 'withdrawal', 'debit', 'Withdrawal approved',
          ?,
          ?, ?,
          ?, ?,
          ?)`,
      [
        withdraw.user_id,
        amount,
        userOpening, userClosing,
        companyOpening, companyClosing,
        transaction_id,
      ]
    );

    await conn.commit();

    return {
      success: true,
      message: "Withdrawal approved successfully",
      data: {
        withdrawal_id:  withdrawId,
        user_id:        withdraw.user_id,
        username:       withdraw.username,
        email:          withdraw.email,
        phone:          withdraw.phone,
        amount,
        transaction_id,
        status:         "APPROVED",
        userOpening,
        userClosing,
        companyOpening,
        companyClosing,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── Reject ────────────────────────────────────────────────────────────────────
export const rejectWithdrawService = async (adminId, withdrawId, body) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const { remarks = "" } = body;

    // 1. Lock & fetch withdrawal (with snapshots)
    const [[withdraw]] = await conn.query(
      `SELECT w.*, u.name AS username, u.email, u.mobile AS phone
       FROM withdraws w
       JOIN users u ON u.id = w.user_id
       WHERE w.id = ?
       FOR UPDATE`,
      [withdrawId]
    );
    if (!withdraw)
      throw new Error("Withdrawal request not found");
    if (withdraw.status !== "PENDING")
      throw new Error(`Withdrawal is already ${withdraw.status.toLowerCase()}`);

    const amount = parseFloat(withdraw.amount);

    // 2. User balance — opening is post-deduction snapshot, closing adds amount back
    const userOpening = Number(withdraw.snapshot_closing); // current state (after deduction at request time)
    const userClosing = Number((userOpening + amount).toFixed(2)); // refund restores it

    // 3. Company balance — no fund movement on rejection, just hold & return
    //    opening and closing are the SAME to keep ledger chain intact
    const companyOpening = await getCompanyBalance(conn);
    const companyClosing = companyOpening; // ✅ no change — money was never sent out

    // 4. Mark REJECTED
    const [updateResult] = await conn.query(
      `UPDATE withdraws
       SET status = 'REJECTED', processed_at = NOW()
       WHERE id = ? AND status = 'PENDING'`,
      [withdrawId]
    );
    // Guard: if another process already changed the status, abort
    if (updateResult.affectedRows === 0)
      throw new Error("Withdrawal could not be rejected (status may have changed)");

    // 5. Refund earnwallet ← runs AFTER status update is confirmed safe
    await conn.query(
      `UPDATE wallets SET earnwallet = earnwallet + ? WHERE user_id = ?`,
      [amount, withdraw.user_id]
    );

    // 6. Approval audit log
    await conn.query(
      `INSERT INTO withdraw_approvals
         (withdrawal_id, admin_id, status, remarks, created_at)
       VALUES (?, ?, 'rejected', ?, NOW())`,
      [withdrawId, adminId, remarks]
    );

    // 7. Wallet transaction — credit (money returned to user earn wallet)
    //    Company opening = closing (same) because no company funds moved
    await conn.query(
      `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark,
          amount,
          useropeningbalance, userclosingbalance,
          opening_balance,    closing_balance,
          reference_id)
       VALUES (?, 'refund', 'credit', 'Withdrawal rejected - refund',
          ?,
          ?, ?,
          ?, ?,
          ?)`,
      [
        withdraw.user_id,
        amount,
        userOpening, userClosing,
        companyOpening, companyClosing, // same value — ledger chain unbroken, no movement
        `REJECTED-${withdrawId}`,
      ]
    );

    await conn.commit();

    return {
      success: true,
      message: "Withdrawal rejected and amount refunded to earn wallet",
      data: {
        withdrawal_id:  withdrawId,
        user_id:        withdraw.user_id,
        username:       withdraw.username,
        email:          withdraw.email,
        phone:          withdraw.phone,
        amount,
        status:         "REJECTED",
        remarks,
        userOpening,
        userClosing,
        companyOpening,
        companyClosing,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ── List all ─────────────────────────────────────────────────────────────────
export const getAllWithdrawalsService = async (query) => {
  const { status, page = 1, limit = 20 } = query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = "WHERE 1=1";
  const params = [];

  if (status) {
    where += " AND w.status = ?";
    params.push(status.toUpperCase());
  }

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM withdraws w ${where}`,
    params
  );

  const [rows] = await db.query(
    `SELECT
       w.id,
       w.user_id,
       w.username,
       w.email,
       w.phone,
       w.amount,
       w.status,
       w.transaction_id,
       w.bank_details,
       w.snapshot_opening,
       w.snapshot_closing,
       w.created_at,
       w.processed_at,
       -- Pull latest approval record inline — no duplicate rows
       (SELECT wa.admin_id  FROM withdraw_approvals wa WHERE wa.withdrawal_id = w.id ORDER BY wa.created_at DESC LIMIT 1) AS admin_id,
       (SELECT wa.remarks   FROM withdraw_approvals wa WHERE wa.withdrawal_id = w.id ORDER BY wa.created_at DESC LIMIT 1) AS remarks,
       (SELECT wa.created_at FROM withdraw_approvals wa WHERE wa.withdrawal_id = w.id ORDER BY wa.created_at DESC LIMIT 1) AS approval_date
     FROM withdraws w
     ${where}
     ORDER BY w.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset]
  );

  return {
    success: true,
    data: rows,
    pagination: {
      total:      parseInt(total),
      page:       parseInt(page),
      limit:      parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    },
  };
};
// ── Single detail ─────────────────────────────────────────────────────────────
export const getWithdrawDetailService = async (withdrawId) => {
  const [rows] = await db.query(
    `SELECT
       CAST(w.id AS CHAR)      AS id,
       CAST(w.user_id AS CHAR) AS user_id,
       w.username,
       w.email,
       w.phone,
       w.amount,
       w.status,
       w.transaction_id,
       w.bank_details,
       w.payment_mode,
       w.snapshot_opening,
       w.snapshot_closing,
       w.created_at,
       w.processed_at,

       -- Derive approval_status from status
       CASE w.status
         WHEN 'APPROVED' THEN 'approved'
         WHEN 'REJECTED' THEN 'rejected'
         ELSE NULL
       END AS approval_status,

       -- Use processed_at as approval_date
       CASE w.status
         WHEN 'PENDING' THEN NULL
         ELSE w.processed_at
       END AS approval_date,

       -- Approval record
       (SELECT wa.admin_id
        FROM withdraw_approvals wa
        WHERE wa.withdrawal_id = w.id
        ORDER BY wa.created_at DESC LIMIT 1) AS admin_id,

       (SELECT wa.remarks
        FROM withdraw_approvals wa
        WHERE wa.withdrawal_id = w.id
        ORDER BY wa.created_at DESC LIMIT 1) AS remarks,

       -- User balances
       -- PENDING  → use snapshots (wallet already deducted at request time)
       -- APPROVED/REJECTED → use actual wallet_transaction record
       CASE w.status
         WHEN 'PENDING' THEN w.snapshot_opening
         ELSE (SELECT wt.useropeningbalance
               FROM wallet_transactions wt
               WHERE (w.status = 'APPROVED' AND wt.reference_id = w.transaction_id)
                  OR (w.status = 'REJECTED' AND wt.reference_id = CONCAT('REJECTED-', w.id))
               LIMIT 1)
       END AS useropeningbalance,

       CASE w.status
         WHEN 'PENDING' THEN w.snapshot_closing
         ELSE (SELECT wt.userclosingbalance
               FROM wallet_transactions wt
               WHERE (w.status = 'APPROVED' AND wt.reference_id = w.transaction_id)
                  OR (w.status = 'REJECTED' AND wt.reference_id = CONCAT('REJECTED-', w.id))
               LIMIT 1)
       END AS userclosingbalance,

       -- Company balances
       -- PENDING → NULL (no company movement yet)
       -- APPROVED/REJECTED → from wallet_transaction
       (SELECT wt.opening_balance
        FROM wallet_transactions wt
        WHERE (w.status = 'APPROVED' AND wt.reference_id = w.transaction_id)
           OR (w.status = 'REJECTED' AND wt.reference_id = CONCAT('REJECTED-', w.id))
        LIMIT 1) AS companyopening,

       (SELECT wt.closing_balance
        FROM wallet_transactions wt
        WHERE (w.status = 'APPROVED' AND wt.reference_id = w.transaction_id)
           OR (w.status = 'REJECTED' AND wt.reference_id = CONCAT('REJECTED-', w.id))
        LIMIT 1) AS companyclosing

     FROM withdraws w
     WHERE CAST(w.id AS CHAR) = ?`,
    [String(withdrawId)]
  );

  const row = rows[0];
  if (!row) throw new Error("Withdrawal not found");
  return { success: true, data: row };
};

//===============================================================================

//chandra wrote by functions

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Prize for a given rank
// ─────────────────────────────────────────────────────────────────────────────

const getPrizeForRank = (rank, prizeDistribution, entryFee, totalWinners, refundStartRank) => {
  if (!rank || rank <= 0) return 0;
  if (rank > totalWinners) return 0;
  if (rank >= refundStartRank) return Number(entryFee) || 0;
  if (!prizeDistribution) return 0;

  let tiers;
  try {
    tiers = typeof prizeDistribution === "string"
      ? JSON.parse(prizeDistribution)
      : prizeDistribution;
  } catch {
    return 0;
  }

  // Single rank tier (e.g. { rank: 1, amount: 4450 })
  const single = tiers.find(t => t.rank === rank);
  if (single) return Number(single.amount) || 0;

  // Range tier (e.g. { rank_from: 11, rank_to: 20, amount: 700 })
  const range = tiers.find(t => rank >= t.rank_from && rank <= t.rank_to);
  return range ? Number(range.amount) || 0 : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS MATCH RESULT
// 1. Match status → RESULT
// 2. All contests for that match → urank update
// 3. winning_amount update
// 4. wallet credit (earn wallet)
// 5. Contest status → RESULT
// ─────────────────────────────────────────────────────────────────────────────

export const processMatchResultService = async (matchId) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // ── Validate match ────────────────────────────────────────────────────
    const [[match]] = await conn.query(
      `SELECT id, status FROM matches WHERE id = ?`,
      [matchId]
    );
    if (!match) throw new Error("Match not found");
    if (match.status === "RESULT") throw new Error("Match result already processed");

    // ── Step 1: Match status → RESULT ─────────────────────────────────────
    await conn.query(
      `UPDATE matches SET status = 'RESULT' WHERE id = ?`,
      [matchId]
    );

    // ── Step 2: Get all contests for this match ───────────────────────────
    const [contests] = await conn.query(
      `SELECT
         id, entry_fee, prize_distribution,
         total_winners, refund_start_rank, min_entries,
         current_entries, is_guaranteed
       FROM contest
       WHERE match_id = ? AND status != 'CANCELLED'`,
      [matchId]
    );

    if (!contests.length) {
      await conn.commit();
      return { success: true, message: "No contests found for this match" };
    }

    const summary = [];

    for (const contest of contests) {
      // ── Check min entries (guaranteed కాకపోతే refund) ──────────────────
      const shouldRefund =
        !contest.is_guaranteed &&
        contest.current_entries < contest.min_entries;

      if (shouldRefund) {
        // Refund all entries
        const [entries] = await conn.query(
          `SELECT user_id, entry_fee FROM contest_entries WHERE contest_id = ?`,
          [contest.id]
        );

        for (const entry of entries) {
          if (parseFloat(entry.entry_fee) > 0) {
            await conn.query(
              `UPDATE wallets SET depositwallet = depositwallet + ? WHERE user_id = ?`,
              [entry.entry_fee, entry.user_id]
            );
            await conn.query(
              `INSERT INTO wallet_transactions
                 (user_id, wallettype, transtype, amount, remark, reference_id)
               VALUES (?, 'deposit', 'credit', ?, 'Contest refund - min entries not met', ?)`,
              [entry.user_id, entry.entry_fee, contest.id]
            );
          }
        }

        await conn.query(
          `UPDATE contest SET status = 'CANCELLED' WHERE id = ?`,
          [contest.id]
        );

        summary.push({
          contest_id: contest.id,
          status: "CANCELLED",
          reason: "Min entries not met",
          refunded: entries.length,
        });
        continue;
      }

      // ── Step 3: Rank all entries by fantasy points ────────────────────
      await conn.query(
        `UPDATE contest_entries ce
         JOIN (
           SELECT
             ce2.id,
             RANK() OVER (
               PARTITION BY ce2.contest_id
               ORDER BY COALESCE(team_pts.total_points, 0) DESC
             ) AS computed_rank
           FROM contest_entries ce2
           LEFT JOIN (
             SELECT
               utp.user_team_id,
               SUM(pms.fantasy_points) AS total_points
             FROM user_team_players utp
             JOIN player_match_stats pms
               ON pms.player_id = utp.player_id
              AND pms.match_id  = ?
             GROUP BY utp.user_team_id
           ) team_pts ON team_pts.user_team_id = ce2.user_team_id
           WHERE ce2.contest_id = ?
         ) ranked ON ranked.id = ce.id
         SET ce.urank = ranked.computed_rank
         WHERE ce.contest_id = ?`,
        [matchId, contest.id, contest.id]
      );

      // ── Step 4: Calculate & update winning_amount ─────────────────────
      const [rankedEntries] = await conn.query(
        `SELECT id, user_id, urank, entry_fee
         FROM contest_entries
         WHERE contest_id = ?`,
        [contest.id]
      );

      let totalWinnersPaid = 0;

      for (const entry of rankedEntries) {
        const prize = getPrizeForRank(
          entry.urank,
          contest.prize_distribution,
          contest.entry_fee,
          contest.total_winners,
          contest.refund_start_rank
        );

        if (prize > 0) {
          // Update winning_amount
          await conn.query(
            `UPDATE contest_entries SET winning_amount = ?, status = 'won'
             WHERE id = ?`,
            [prize, entry.id]
          );

          // Credit earn wallet
          await conn.query(
            `UPDATE wallets SET earnwallet = earnwallet + ? WHERE user_id = ?`,
            [prize, entry.user_id]
          );

          // Wallet transaction
          await conn.query(
            `INSERT INTO wallet_transactions
               (user_id, wallettype, transtype, amount, remark, reference_id)
             VALUES (?, 'winning', 'credit', ?, 'Contest winnings', ?)`,
            [entry.user_id, prize, contest.id]
          );

          totalWinnersPaid++;
        } else {
          await conn.query(
            `UPDATE contest_entries SET status = 'lost' WHERE id = ?`,
            [entry.id]
          );
        }
      }

      // ── Step 5: Contest status → RESULT ──────────────────────────────
      await conn.query(
        `UPDATE contest SET status = 'RESULT' WHERE id = ?`,
        [contest.id]
      );

      summary.push({
        contest_id:          contest.id,
        status:              "RESULT",
        total_entries:       rankedEntries.length,
        total_winners_paid:  totalWinnersPaid,
      });
    }

    await conn.commit();

    return {
      success: true,
      match_id: parseInt(matchId),
      contests_processed: summary.length,
      summary,
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SET MATCH LIVE
// ─────────────────────────────────────────────────────────────────────────────

export const setMatchLiveService = async (matchId) => {
  const [[match]] = await db.query(
    `SELECT id, status FROM matches WHERE id = ?`,
    [matchId]
  );
  if (!match) throw new Error("Match not found");
  if (match.status === "RESULT") throw new Error("Match already completed");
  if (match.status === "LIVE") throw new Error("Match already live");

  await db.query(
    `UPDATE matches SET status = 'LIVE' WHERE id = ?`,
    [matchId]
  );

  await db.query(
    `UPDATE contest SET status = 'LIVE' WHERE match_id = ? AND status != 'CANCELLED'`,
    [matchId]
  );

  return {
    success: true,
    message: `Match ${matchId} is now LIVE`,
  };
};