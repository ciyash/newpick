import db from "../../config/db.js";
import bcrypt from "bcrypt";

/* ================= ADMIN LOG HELPER ================= */
const logAdmin = async (conn, admin, action, entity, entityId, ip) => {
  await conn.query(
    `INSERT INTO admin_logs 
     (admin_id, email, action, entity, entity_id, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [admin.id, admin.email, action, entity, entityId, ip]
  );
};

/* ================= ADMINS ================= */

export const createAdmin = async (req, res) => {
  try {
  
    const hash = await bcrypt.hash(data.password, 12);

   const [res] = await conn.query(
      `INSERT INTO admin
       (name,email,password_hash,role,status,created_at)
       VALUES (?,?,?,?,?, NOW())`,
      [data.name, data.email, hash, data.role, "active"]
    );

    await logAdmin(conn, admin, "CREATE_ADMIN", "admin", res.insertId, ip);
    await conn.commit();
    return { id: res.insertId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

export const getAdmins = async () => {
  try {
    const [rows] = await db.query(
      `SELECT id,name,email,role,status,created_at FROM admin`
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

export const getAdminById = async (id) => {
  try {
    const [[row]] = await db.query(
      `SELECT id,name,email,role,status FROM admin WHERE id=?`,
      [id]
    );
    if (!row) throw new Error("Admin not found");
    return row;
  } catch (err) {
    throw err;
  }
};

export const updateAdmin = async (id, data, admin, ip) => {
  try {
    if (!Object.keys(data).length) {
      throw new Error("No data to update");
    }

    const [res] = await db.query(`UPDATE admin SET ? WHERE id=?`, [data, id]);
    if (!res.affectedRows) throw new Error("Admin not found");

    await logAdmin(db, admin, "UPDATE_ADMIN", "admin", id, ip);
  } catch (err) {
    throw err;
  }
};

/* ================= SERIES ================= */

export const createSeries = async (data, admin, ip) => {
  try {
    const [[{ nextSeriesId }]] = await db.query(
      `SELECT IFNULL(MAX(seriesid), 0) + 1 AS nextSeriesId FROM series`
    );

    const [res] = await db.query(
      `INSERT INTO series
       (seriesid, name, season, start_date, end_date, provider_series_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        nextSeriesId,
        data.name,
        data.season,
        data.start_date,
        data.end_date,
        data.provider_series_id
      ]
    );

    await logAdmin(db, admin, "CREATE_SERIES", "series", res.insertId, ip);
    return { id: res.insertId, seriesid: nextSeriesId };
  } catch (err) {
    throw err;
  }
};


export const getSeries = async () => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM series ORDER BY start_date DESC`
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

export const getSeriesById = async (id) => {
  try {
    const [[row]] = await db.query(`SELECT * FROM series WHERE seriesid=?`, [id]);
    if (!row) throw new Error("Series not found");
    return row;
  } catch (err) {
    throw err;
  }
};
//

export const updateSeries = async (id, data, admin, ip) => {
  try {
    if (!Object.keys(data).length) {
      throw new Error("No data to update");
    }

    const [res] = await db.query(`UPDATE series SET ? WHERE id=?`, [data, id]);
    if (!res.affectedRows) throw new Error("Series not found");

    await logAdmin(db, admin, "UPDATE_SERIES", "series", id, ip);
  } catch (err) {
    throw err;
  }
};

/* ================= MATCHES ================= */

export const createMatch = async (data, admin, ip) => {
  try {
  
    const [[series]] = await db.query(
      `SELECT name AS seriesname FROM series WHERE seriesid = ?`,
      [data.series_id]
    );

    console.log("Series Result:", series);

    if (!series || !series.seriesname) {
      throw new Error("Invalid series_id");
    }

    
    const [[homeTeam]] = await db.query(
      `SELECT name AS teamname FROM teams WHERE id = ?`,
      [data.home_team_id]
    );

    console.log("Home Team Result:", homeTeam);

    if (!homeTeam || !homeTeam.teamname) {
      throw new Error("Invalid home_team_id");
    }

    
    const [[awayTeam]] = await db.query(
      `SELECT name AS teamname FROM teams WHERE id = ?`,
      [data.away_team_id]
    );

    console.log("Away Team Result:", awayTeam);

    if (!awayTeam || !awayTeam.teamname) {
      throw new Error("Invalid away_team_id");
    }

    
    const [res] = await db.query(
      `
      INSERT INTO matches
      (
        series_id,
        seriesname,
        home_team_id,
        hometeamname,
        away_team_id,
        awayteamname,
        start_time,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'UPCOMING', NOW())
      `,
      [
        data.series_id,
        series.seriesname,       
        data.home_team_id,
        homeTeam.teamname,        
        data.away_team_id,
        awayTeam.teamname,        
        data.start_time
      ]
    );

    await logAdmin(db, admin, "CREATE_MATCH", "match", res.insertId, ip);
    return { id: res.insertId };
  } catch (err) {
    console.error("CreateMatch Error:", err.message);
    throw err;
  }
};

export const getMatches = async () => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM matches ORDER BY start_time DESC`
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

export const getMatchById = async (id) => {
  try {
    const [[row]] = await db.query(`SELECT * FROM matches WHERE id=?`, [id]);
    if (!row) throw new Error("Match not found");
    return row;
  } catch (err) {
    throw err;
  }
};

export const getMatchBySeries = async (seriesId) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM matches WHERE series_id=? ORDER BY start_time`,
      [seriesId]
    );
    if (!rows.length) throw new Error("No matches found for series");
    return rows;
  } catch (err) {
    throw err;
  }
};

export const updateMatch = async (id, data, admin, ip) => {
  try {
    if (!Object.keys(data).length) {
      throw new Error("No data to update");
    }

    const [res] = await db.query(`UPDATE matches SET ? WHERE id=?`, [data, id]);
    if (!res.affectedRows) throw new Error("Match not found");

    await logAdmin(db, admin, "UPDATE_MATCH", "match", id, ip);
  } catch (err) {
    throw err;
  }
};


/* ================= TEAMS ================= */

export const createTeam = async (data, admin, ip) => {
  try {
    const [res] = await db.query(
      `INSERT INTO teams (name,short_name) VALUES (?,?)`,
      [data.name, data.short_name]
    );

    await logAdmin(db, admin, "CREATE_TEAM", "team", res.insertId, ip);
    return { id: res.insertId };
  } catch (err) {
    throw err;
  }
};

export const getTeams = async () => {
  try {
    const [rows] = await db.query(`SELECT * FROM teams ORDER BY name`);
    return rows;
  } catch (err) {
    throw err;
  }
};

export const getTeamById = async (id) => {
  try {
    const [[row]] = await db.query(`SELECT * FROM teams WHERE id=?`, [id]);
    if (!row) throw new Error("Team not found");
    return row;
  } catch (err) {
    throw err;
  }
};

export const updateTeam = async (id, data, admin, ip) => {
  try {
    if (!Object.keys(data).length) {
      throw new Error("No data to update");
    }

    const [res] = await db.query(`UPDATE teams SET ? WHERE id=?`, [data, id]);
    if (!res.affectedRows) throw new Error("Team not found");

    await logAdmin(db, admin, "UPDATE_TEAM", "team", id, ip);
  } catch (err) {
    throw err;
  }
};

/* ================= PLAYERS ================= */

export const createPlayer = async (data, admin, ip) => {
  try {
    const points = Number.isInteger(data.points) ? data.points : 0;
    const playercredits = Number.isInteger(data.playercredits) ? data.playercredits : 0;

    const [res] = await db.query(
      `INSERT INTO players
       (team_id, name, position, points,playercredits, created_at)
       VALUES (?, ?, ?, ?,?, NOW())`,
      [data.team_id, data.name, data.position, points,playercredits]
    );

    await logAdmin(db, admin, "CREATE_PLAYER", "player", res.insertId, ip);

    return {
      success: true,
      id: res.insertId
    };
  } catch (err) {
    // Optional: log error here
    throw {
      success: false,
      message: err.message || "Failed to create player",
      error: err
    };
  }
};





export const getPlayers = async () => {
  try {
    const [rows] = await db.query(`SELECT * FROM players ORDER BY name`);
    return rows;
  } catch (err) {
    throw err;
  }
};

export const getPlayerById = async (id) => {
  try {
    const [[row]] = await db.query(`SELECT * FROM players WHERE id=?`, [id]);
    if (!row) throw new Error("Player not found");
    return row;
  } catch (err) {
    throw err;
  }
};

export const getPlayerByTeam = async (teamId) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM players WHERE team_id=? ORDER BY name`,
      [teamId]
    );
    if (!rows.length) throw new Error("No players found for team");
    return rows;
  } catch (err) {
    throw err;
  }
};

export const updatePlayer = async (id, data, admin, ip) => {
  try {
    if (!Object.keys(data).length) {
      throw new Error("No data to update");
    }

    const [res] = await db.query(`UPDATE players SET ? WHERE id=?`, [data, id]);
    if (!res.affectedRows) throw new Error("Player not found");

    await logAdmin(db, admin, "UPDATE_PLAYER", "player", id, ip);
  } catch (err) {
    throw err;
  }
};

/* ================= CONTEST ================= */

export const createContest = async (data) => {
  try {

    const [[existing]] = await db.query(
      `SELECT id FROM contest 
       WHERE match_id = ? AND contest_type = ?`,
      [data.match_id, data.contest_type]
    );

    if (existing) {
      throw new Error(`Contest type '${data.contest_type}' already exists for this match`);
    }

    const [res] = await db.query(
      `INSERT INTO contest
        (match_id, contest_type, entry_fee, platform_fee_percentage,
         prize_pool, net_pool_prize,
         max_entries, min_entries, current_entries,
         is_guaranteed,
         winner_percentage, total_winners,
         first_prize, prize_distribution,
         is_cashback, cashback_percentage, cashback_amount,
         platform_fee_amount,
         status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.match_id,                  
        data.contest_type,               
        data.entry_fee,                   
        data.platform_fee_percentage,    

        0,       // prize_pool
        0,       // net_pool_prize
        0,       // max_entries
        0,       // min_entries
        0,       // current_entries
        0,       // is_guaranteed
        0,       // winner_percentage
        0,       // total_winners
        0,       // first_prize
        null,    // prize_distribution
        0,       // is_cashback
        0,       // cashback_percentage
        0,       // cashback_amount
        0,       // platform_fee_amount
        data.status ?? 'UPCOMING',        
        new Date(),                       
      ]
    );

    return { id: res.insertId };
  } catch (err) {
    console.error('Create contest DB error:', err);
    throw err;
  }
};

export const createContestold = async (data) => {
  try {
   
     const totalCollected = data.max_entries * data.entry_fee;
    const platformFeeAmount = (totalCollected * (data.platform_fee_percentage ?? 0)) / 100;
    let cashbackAmount = 0;
    let cashback_percentage=0;
    const is_cashback=1;
    // const netPrizePool = totalCollected - platformFeeAmount - cashbackAmount;
    const netAfterFee = totalCollected - platformFeeAmount;
    const totalWinners = Math.floor((data.max_entries * (data.winner_percentage ?? 0)) / 100);
    const bonusWinners = Math.floor(totalWinners * 0.01);
    const refundWinners = totalWinners - bonusWinners + 1;
     cashbackAmount = refundWinners * data.entry_fee;
     cashback_percentage = (cashbackAmount / totalCollected) * 100
     const netPrizePool = netAfterFee - cashbackAmount;
    const prizeDistribution = data.prize_distribution
      ? JSON.stringify(data.prize_distribution)
      : null;

    const [res] = await db.query(
      `INSERT INTO contest
       (match_id, entry_fee, prize_pool,net_pool_prize, max_entries, min_entries, current_entries,
        contest_type, is_guaranteed, winner_percentage, total_winners,
        first_prize, prize_distribution, is_cashback,
        cashback_percentage, cashback_amount,
        platform_fee_percentage, platform_fee_amount,
        status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.match_id,
        data.entry_fee,
        netPrizePool, 
        netAfterFee,         // calculated
        data.max_entries,
        data.min_entries ?? 0,
        0,                     
        data.contest_type,
        data.is_guaranteed ?? 0,
        data.winner_percentage ?? 0,
        totalWinners,          
        data.first_prize ?? 0,
        prizeDistribution,
        data.is_cashback ?? 0,
        cashback_percentage,
        cashbackAmount,        // calculated
        data.platform_fee_percentage ?? 0,
        platformFeeAmount,     
        data.status ?? "UPCOMING",
        new Date()
      ]
    );


    return { id: res.insertId };
  } catch (err) {
    console.error("Create contest DB error:", err);
    throw err;
  }
};

export const getContests = async () => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM contest ORDER BY created_at DESC`
    );
    return rows;
  } catch (err) {
    throw err;
  }
};


export const getContestById = async (id) => {
  try {
    const [[row]] = await db.query(
      `SELECT * FROM contest WHERE id = ?`,
      [id]
    );

    if (!row) throw new Error("Contest not found");
    return row;
  } catch (err) {
    throw err;
  }
};

export const updateContest = async (id, data) => {
  try {
    const contestId = parseInt(id, 10);
    if (isNaN(contestId)) throw new Error('Invalid contest id');

    const [[contest]] = await db.query(
      `SELECT * FROM contest WHERE id = ?`,
      [contestId]
    );
    if (!contest) throw new Error('Contest not found');
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

    let cashbackAmount      = 0;
    let cashback_percentage = 0;
    if (totalWinners > 0) {
      const bonusWinners  = Math.floor(totalWinners * 0.01);
      const refundWinners = totalWinners - bonusWinners + 1;
      cashbackAmount      = refundWinners * merged.entry_fee;
      cashback_percentage = totalCollected > 0
        ? (cashbackAmount / totalCollected) * 100
        : 0;
    }

    const netPrizePool = Math.max(0, netAfterFee - cashbackAmount);

    let prizeDistribution = null;
    if (merged.prize_distribution) {
      prizeDistribution = typeof merged.prize_distribution === 'object'
        ? JSON.stringify(merged.prize_distribution)
        : merged.prize_distribution;
    }

    const [result] = await db.query(
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
        cashback_percentage,
        cashbackAmount,
        merged.first_prize,
        prizeDistribution,
        merged.is_guaranteed,
        merged.status,
        contestId,
      ]
    );

    if (result.affectedRows === 0) throw new Error('Contest update failed');

    return { id: contestId, updated: true };
  } catch (err) {
    console.error('Update contest DB error:', err);
    throw err;
  }
};


export const getContestsByMatch = async (matchId) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM contest WHERE match_id = ? ORDER BY created_at DESC`,
      [matchId]
    );

    if (!rows.length) throw new Error("No contests found for match");
    return rows;
  } catch (err) {
    throw err;
  }
};

export const getContestsBySeries = async (seriesId) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*
       FROM contest c
       JOIN matches m ON m.id = c.match_id
       WHERE m.series_id = ?
       ORDER BY c.created_at DESC`,
      [seriesId]
    );

    if (!rows.length) throw new Error("No contests found for series");
    return rows;
  } catch (err) {
    throw err;
  }
};

export const getContestsByTeam = async (teamId) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT c.*
       FROM contest c
       JOIN matches m ON m.id = c.match_id
       WHERE m.home_team_id = ? OR m.away_team_id = ?
       ORDER BY c.created_at DESC`,
      [teamId, teamId]
    );

    if (!rows.length) throw new Error("No contests found for team");
    return rows;
  } catch (err) {
    throw err;
  }
};


/* ================= CONTEST CATEGORY ================= */

export const createContestCategory = async (data) => {
  try {
    const [res] = await db.query(
      `
      INSERT INTO contestcategory
      (name, percentage, entryfee,platformfee, created_at)
      VALUES (?, ?, ?, ?,?)
      `,
      [
        data.name,
        data.percentage,
        data.entryfee,
         data.platformfee,
        new Date()
      ]
    );

    return { id: res.insertId };
  } catch (err) {
    console.error("Create contest category DB error:", err);
    throw err;
  }
};
export const getContestcategory = async () => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM contestcategory ORDER BY id DESC`
    );
    return rows;
  } catch (err) {
    throw err;
  }
};

/* ================= Dashboard ================= */
export const getHomeservice = async () => {
  try {

    const [[{ totalRegistered }]] = await db.query(`
      SELECT COUNT(*) AS totalRegistered 
      FROM users
    `);

    const [[{ activeUsers }]] = await db.query(`
      SELECT COUNT(*) AS activeUsers 
      FROM users 
      WHERE phoneverify = 1 AND email = 1
    `);

    const [[{ kycVerified }]] = await db.query(`
      SELECT COUNT(*) AS kycVerified 
      FROM users 
      WHERE iskycverify = 1
    `);

    const [[{ notKycVerified }]] = await db.query(`
      SELECT COUNT(*) AS notKycVerified 
      FROM users 
      WHERE iskycverify = 0
    `);

    const [[{ totalAmountReceived }]] = await db.query(`
      SELECT COALESCE(SUM(amount), 0) AS totalAmountReceived 
      FROM wallet_transactions 
      WHERE wallettype IN ('deposit', 'subscribe', 'entry_fee')
    `);

    const [[{ totalWithdrawAmount }]] = await db.query(`
      SELECT COALESCE(SUM(amount), 0) AS totalWithdrawAmount 
      FROM wallet_transactions 
      WHERE wallettype = 'withdraw'
    `);
    const [[{ liveMatches }]] = await db.query(`
      SELECT COUNT(*) AS liveMatches 
      FROM matches 
      WHERE status = 'LIVE'
    `);

    const [[{ launchedMatches }]] = await db.query(`
      SELECT COUNT(*) AS launchedMatches 
      FROM matches 
      WHERE status = 'UPCOMING'
    `);

    const [[{ completedMatches }]] = await db.query(`
      SELECT COUNT(*) AS completedMatches 
      FROM matches 
      WHERE status = 'COMPLETED'
    `);

    const [[{ reviewMatches }]] = await db.query(`
      SELECT COUNT(*) AS reviewMatches 
      FROM matches 
      WHERE status = 'INREVIEW'
    `);

    const [[{ cancelledMatches }]] = await db.query(`
      SELECT COUNT(*) AS cancelledMatches 
      FROM matches 
      WHERE status = 'ABANDONED'
    `);

    const [[{ pendingWithdrawRequests }]] = await db.query(`
      SELECT COUNT(*) AS pendingWithdrawRequests 
      FROM withdraws 
      WHERE status = 'pending'
    `);

    const [[{ approvedWithdrawRequests }]] = await db.query(`
      SELECT COUNT(*) AS approvedWithdrawRequests 
      FROM withdraws 
      WHERE status = 'approved'
    `);

    const [[{ rejectedWithdrawRequests }]] = await db.query(`
      SELECT COUNT(*) AS rejectedWithdrawRequests 
      FROM withdraws 
      WHERE status = 'rejected'
    `);

    const [[{ totalTeams }]] = await db.query(`
      SELECT COUNT(*) AS totalTeams
      FROM teams
    `);

    const [[{ totalPlayers }]] = await db.query(`
      SELECT COUNT(*) AS totalPlayers
      FROM players
    `);

    const [[{ totalUserTeams }]] = await db.query(`
      SELECT COUNT(*) AS totalUserTeams
      FROM user_teams
    `);

    const [[{ totalUserTeamPlayers }]] = await db.query(`
      SELECT COUNT(*) AS totalUserTeamPlayers
      FROM user_team_players
    `);

    const [contests] = await db.query(`
      SELECT
        c.created_at,
        c.contest_type,
        c.max_entries,
        c.current_entries,
        c.status,
       CONCAT(m.hometeamname, ' vs ', m.awayteamname) AS match_name
      FROM contest c
      LEFT JOIN matches m ON m.id = c.match_id
      ORDER BY c.created_at DESC
    `);

    return {
      users: {
        totalRegistered,
        activeUsers,
        kycVerified,
        notKycVerified,
      },
      wallet: {
        totalAmountReceived,
        totalWithdrawAmount,
      },
      matches: {
        live:      liveMatches,
        launched:  launchedMatches,
        completed: completedMatches,
        inReview:  reviewMatches,
        cancelled: cancelledMatches,
        total:     liveMatches + launchedMatches + completedMatches + reviewMatches + cancelledMatches,
      },
      withdrawRequests: {
        pending:  pendingWithdrawRequests,
        approved: approvedWithdrawRequests,
        rejected: rejectedWithdrawRequests,
        total:    pendingWithdrawRequests + approvedWithdrawRequests + rejectedWithdrawRequests,
      },
      teams: {
        totalTeams,
        totalPlayers,
      },
      userTeams: {
        totalUserTeams,
        totalUserTeamPlayers,
      },
      contests,
    };

  } catch (err) {
    throw err;
  }
};

/* ================= DEPOSITE ================= */

export const getallDeposites = async () => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM deposite ORDER BY id DESC`
    );
     if (!rows.length) throw new Error('No deposits found');
    return rows;
  } catch (err) {
    throw err;
  }
};

export const fetchDeposites = async (filters = {}) => {
  const { depositeType, status, minAmount, maxAmount, phone, startDate, endDate,transaction_id  } = filters;

  const conditions = [];
  const params = [];

  if (depositeType?.trim())  { conditions.push(`depositeType = ?`);  params.push(depositeType.trim()); }
  if (status?.trim())        { conditions.push(`status = ?`);        params.push(status.trim()); }
  if (phone?.trim())         { conditions.push(`phone = ?`);         params.push(phone.trim()); }
  if (minAmount !== undefined && minAmount !== '') { conditions.push(`amount >= ?`); params.push(Number(minAmount)); }
  if (maxAmount !== undefined && maxAmount !== '') { conditions.push(`amount <= ?`); params.push(Number(maxAmount)); }
  if (startDate?.trim())     { conditions.push(`createdAt >= ?`);    params.push(new Date(startDate.trim())); }
  if (endDate?.trim())       { conditions.push(`createdAt <= ?`);    params.push(new Date(endDate.trim())); }
  if (transaction_id?.trim())  { conditions.push(`transaction_id = ?`);  params.push(transaction_id.trim()); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM deposite ${where} ORDER BY id DESC`;

  const [rows] = await db.query(query, params);

  if (!rows.length) throw new Error('No deposits found');

  return rows;
};

export const fetchDepositesSummary = async () => {
  const [rows] = await db.query(`
    SELECT 
      status,
      SUM(amount) AS totalAmount,
      COUNT(*)    AS totalCount
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

/* ================= WITHDRAW ================= */

export const getallWithdraws = async () => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM withdraws ORDER BY id DESC`
    );
     if (!rows.length) throw new Error('No withdraws found');
    return rows;
  } catch (err) {
    throw err;
  }
};

export const fetchWithdraws = async (filters = {}) => {
  const { payment_mode, status, minAmount, maxAmount, phone, startDate, endDate, transaction_id } = filters;

  const conditions = [];
  const params = [];

  if (payment_mode?.trim())   { conditions.push(`payment_mode = ?`);   params.push(payment_mode.trim()); }
  if (status?.trim())         { conditions.push(`status = ?`);         params.push(status.trim()); }
  if (phone?.trim())          { conditions.push(`phone = ?`);          params.push(phone.trim()); }
  if (transaction_id?.trim()) { conditions.push(`transaction_id = ?`); params.push(transaction_id.trim()); }
  if (minAmount !== undefined && minAmount !== '') { conditions.push(`amount >= ?`); params.push(Number(minAmount)); }
  if (maxAmount !== undefined && maxAmount !== '') { conditions.push(`amount <= ?`); params.push(Number(maxAmount)); }
  if (startDate?.trim())      { conditions.push(`createdAt >= ?`);     params.push(new Date(startDate.trim())); }
  if (endDate?.trim())        { conditions.push(`createdAt <= ?`);     params.push(new Date(endDate.trim())); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM withdraws ${where} ORDER BY id DESC`;

  const [rows] = await db.query(query, params);

  if (!rows.length) throw new Error('No withdraws found');

  return rows;
};

export const fetchWithdrawsSummary = async () => {
  const [rows] = await db.query(`
    SELECT 
      status,
      SUM(amount) AS totalAmount,
      COUNT(*)    AS totalCount
    FROM withdraws
    GROUP BY status
    HAVING status IN ('pending', 'approved', 'rejected')
    ORDER BY status
  `);

  const summary = {
    pending: { totalAmount: 0, totalCount: 0 },
    approved: { totalAmount: 0, totalCount: 0 },
    rejected:  { totalAmount: 0, totalCount: 0 },
  };

  rows.forEach(({ status, totalAmount, totalCount }) => {
    summary[status] = { totalAmount: Number(totalAmount), totalCount: Number(totalCount) };
  });

  return summary;
};


/* ================= USERS ================= */

export const getallUsers = async () => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM users ORDER BY id DESC`
    );
     if (!rows.length) throw new Error('No withdraws found');
    return rows;
  } catch (err) {
    throw err;
  }
};

export const fetchUsers = async (filters = {}) => {
  const { name, usedcode, email, mobile, account_status, kyc_status, userid, referalid } = filters;

  const conditions = [];
  const params = [];

  if (userid)                { conditions.push(`id = ?`);             params.push(Number(userid)); }
  if (referalid)             { conditions.push(`referalid = ?`);      params.push(Number(referalid)); }
  if (name?.trim())          { conditions.push(`name LIKE ?`);        params.push(`%${name.trim()}%`); }
  if (email?.trim())         { conditions.push(`email = ?`);          params.push(email.trim()); }
  if (mobile?.trim())        { conditions.push(`mobile = ?`);         params.push(mobile.trim()); }
  if (usedcode?.trim())      { conditions.push(`usedcode = ?`);       params.push(usedcode.trim()); }
  if (account_status?.trim()){ conditions.push(`account_status = ?`); params.push(account_status.trim()); }
  if (kyc_status?.trim())    { conditions.push(`kyc_status = ?`);     params.push(kyc_status.trim()); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `SELECT * FROM users ${where} ORDER BY id DESC`;

  const [rows] = await db.query(query, params);

  if (!rows.length) throw new Error('No users found');

  return rows;
};



export const fetchUsersByKycStatus = async (filters = {}) => {
  const { kyc_status } = filters;

  const conditions = [`kyc_status = ?`];
  const params = [kyc_status?.trim() ?? 'not_started'];

  const query = `SELECT * FROM users WHERE ${conditions.join(' AND ')} ORDER BY id DESC`;

  const [rows] = await db.query(query, params);
  if (!rows.length) throw new Error(`No users found with kyc_status: ${kyc_status}`);
  return rows;
};


export const fetchUsersByAccountStatus = async (filters = {}) => {
  const { account_status } = filters;

  const conditions = [`account_status = ?`];
  const params = [account_status?.trim() ?? 'active'];

  const query = `SELECT * FROM users WHERE ${conditions.join(' AND ')} ORDER BY id DESC`;

  const [rows] = await db.query(query, params);
  if (!rows.length) throw new Error(`No users found with account_status: ${account_status}`);
  return rows;
};