import db from "../../config/db.js";
import bcrypt from "bcrypt";

//adminlog
const logAdmin = async (conn, admin, action, entity, entityId, ip) => {
  await conn.query(
    `INSERT INTO admin_logs 
     (admin_id, email, action, entity, entity_id, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [admin.id, admin.email, action, entity, entityId, ip]
  );
};

//Employee

export const createAdmin = async (data, admin, ip) => {       
  const conn = await db.getConnection();                       
  try {
    await conn.beginTransaction();

    const hash = await bcrypt.hash(data.password, 12);

    const [result] = await conn.query(                        
      `INSERT INTO admin
       (name, email, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [data.name, data.email, hash, data.role, "active"]
    );

    await logAdmin(conn, admin, "CREATE_ADMIN", "admin", result.insertId, ip);
    await conn.commit();
    return { id: result.insertId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

export const getAdmins = async () => {
  const [rows] = await db.query(
    `SELECT id, name, email, role, status, created_at FROM admin ORDER BY id DESC`
  );
  return rows;
};

export const getAdminById = async (id) => {
  const [[row]] = await db.query(
    `SELECT id, name, email, role, status FROM admin WHERE id = ?`,
    [id]
  );
  if (!row) throw new Error("Admin not found");
  return row;
};

export const updateAdmin = async (id, data, admin, ip) => {
  if (!Object.keys(data).length) throw new Error("No data to update");

  const conn = await db.getConnection();                      
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(`UPDATE admin SET ? WHERE id = ?`, [data, id]);
    if (!result.affectedRows) throw new Error("Admin not found");

    await logAdmin(conn, admin, "UPDATE_ADMIN", "admin", id, ip); 
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//series

export const createSeries = async (data, admin, ip) => {
  const conn = await db.getConnection();                      
  try {
    await conn.beginTransaction();

    const [[{ nextSeriesId }]] = await conn.query(
      `SELECT IFNULL(MAX(seriesid), 0) + 1 AS nextSeriesId FROM series`
    );

    const [result] = await conn.query(
      `INSERT INTO series
       (seriesid, name, season, start_date, end_date, provider_series_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [nextSeriesId, data.name, data.season, data.start_date, data.end_date, data.provider_series_id]
    );

    await logAdmin(conn, admin, "CREATE_SERIES", "series", result.insertId, ip);
    await conn.commit();
    return { id: result.insertId, seriesid: nextSeriesId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getSeries = async () => {
  const [rows] = await db.query(`SELECT * FROM series ORDER BY start_date DESC`);
  return rows;
};

export const getSeriesById = async (id) => {
  const [[row]] = await db.query(`SELECT * FROM series WHERE seriesid = ?`, [id]);
  if (!row) throw new Error("Series not found");
  return row;
};

export const updateSeries = async (id, data, admin, ip) => {
  if (!Object.keys(data).length) throw new Error("No data to update");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `UPDATE series SET ? WHERE seriesid = ?`,              
      [data, id]
    );
    if (!result.affectedRows) throw new Error("Series not found");

    await logAdmin(conn, admin, "UPDATE_SERIES", "series", id, ip);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//matches

export const createMatch = async (data, admin, ip) => {
  const conn = await db.getConnection();                      
  try {
    await conn.beginTransaction();

    const [[series]] = await conn.query(
      `SELECT name AS seriesname FROM series WHERE seriesid = ?`,
      [data.series_id]
    );
    if (!series) throw new Error("Invalid series_id");

    const [[homeTeam]] = await conn.query(
      `SELECT name AS teamname FROM teams WHERE id = ?`,
      [data.home_team_id]
    );
    if (!homeTeam) throw new Error("Invalid home_team_id");

    const [[awayTeam]] = await conn.query(
      `SELECT name AS teamname FROM teams WHERE id = ?`,
      [data.away_team_id]
    );
    if (!awayTeam) throw new Error("Invalid away_team_id");

    const [result] = await conn.query(
      `INSERT INTO matches
       (series_id, seriesname, home_team_id, hometeamname, away_team_id, awayteamname, start_time, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'UPCOMING', NOW())`,
      [data.series_id, series.seriesname, data.home_team_id, homeTeam.teamname, data.away_team_id, awayTeam.teamname, data.start_time]
    );

    await logAdmin(conn, admin, "CREATE_MATCH", "match", result.insertId, ip);
    await conn.commit();
    return { id: result.insertId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getMatches = async () => {
  const [rows] = await db.query(`SELECT * FROM matches ORDER BY start_time DESC`);
  return rows;
};

export const getMatchById = async (id) => {
  const [[row]] = await db.query(`SELECT * FROM matches WHERE id = ?`, [id]);
  if (!row) throw new Error("Match not found");
  return row;
};

export const getMatchBySeries = async (seriesId) => {
  const [rows] = await db.query(
    `SELECT * FROM matches WHERE series_id = ? ORDER BY start_time`,
    [seriesId]
  );
  if (!rows.length) throw new Error("No matches found for series");
  return rows;
};

export const updateMatch = async (id, data, admin, ip) => {
  if (!Object.keys(data).length) throw new Error("No data to update");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(`UPDATE matches SET ? WHERE id = ?`, [data, id]);
    if (!result.affectedRows) throw new Error("Match not found");

    await logAdmin(conn, admin, "UPDATE_MATCH", "match", id, ip);
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
  const conn = await db.getConnection();                      
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO teams (name, short_name) VALUES (?, ?)`,
      [data.name, data.short_name]
    );

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

export const getTeams = async () => {
  const [rows] = await db.query(`SELECT * FROM teams ORDER BY name`);
  return rows;
};

export const getTeamById = async (id) => {
  const [[row]] = await db.query(`SELECT * FROM teams WHERE id = ?`, [id]);
  if (!row) throw new Error("Team not found");
  return row;
};

export const updateTeam = async (id, data, admin, ip) => {
  if (!Object.keys(data).length) throw new Error("No data to update");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(`UPDATE teams SET ? WHERE id = ?`, [data, id]);
    if (!result.affectedRows) throw new Error("Team not found");

    await logAdmin(conn, admin, "UPDATE_TEAM", "team", id, ip);
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
  const conn = await db.getConnection();                      
  try {
    await conn.beginTransaction();

    const points        = Number.isInteger(data.points)        ? data.points        : 0;
    const playercredits = Number.isInteger(data.playercredits) ? data.playercredits : 0;

    const [result] = await conn.query(
      `INSERT INTO players
       (team_id, name, position, points, playercredits, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [data.team_id, data.name, data.position, points, playercredits]
    );

    await logAdmin(conn, admin, "CREATE_PLAYER", "player", result.insertId, ip);
    await conn.commit();
    return { id: result.insertId };                          
  } catch (err) {
    await conn.rollback();
    throw err;                                               
  } finally {
    conn.release();
  }
};

export const getPlayers = async () => {
  const [rows] = await db.query(`SELECT * FROM players ORDER BY name`);
  return rows;
};

export const getPlayerById = async (id) => {
  const [[row]] = await db.query(`SELECT * FROM players WHERE id = ?`, [id]);
  if (!row) throw new Error("Player not found");
  return row;
};

export const getPlayerByTeam = async (teamId) => {
  const [rows] = await db.query(
    `SELECT * FROM players WHERE team_id = ? ORDER BY name`,
    [teamId]
  );
  if (!rows.length) throw new Error("No players found for team");
  return rows;
};

export const updatePlayer = async (id, data, admin, ip) => {
  if (!Object.keys(data).length) throw new Error("No data to update");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(`UPDATE players SET ? WHERE id = ?`, [data, id]);
    if (!result.affectedRows) throw new Error("Player not found");

    await logAdmin(conn, admin, "UPDATE_PLAYER", "player", id, ip);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//contest

export const createContest = async (data) => {
  const [[existing]] = await db.query(
    `SELECT id FROM contest WHERE match_id = ? AND contest_type = ?`,
    [data.match_id, data.contest_type]
  );
  if (existing) throw new Error(`Contest type '${data.contest_type}' already exists for this match`);

  const [result] = await db.query(
    `INSERT INTO contest
      (match_id, contest_type, entry_fee, platform_fee_percentage,
       prize_pool, net_pool_prize, max_entries, min_entries, current_entries,
       is_guaranteed, winner_percentage, total_winners,
       first_prize, prize_distribution,
       is_cashback, cashback_percentage, cashback_amount,
       platform_fee_amount, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.match_id, data.contest_type, data.entry_fee, data.platform_fee_percentage,
      0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0, 0, 0, 0,
      data.status ?? 'UPCOMING', new Date(),
    ]
  );

  return { id: result.insertId };
};

export const createContestold = async (data) => {
  const totalCollected    = data.max_entries * data.entry_fee;
  const platformFeeAmount = (totalCollected * (data.platform_fee_percentage ?? 0)) / 100;
  const netAfterFee       = totalCollected - platformFeeAmount;
  const totalWinners      = Math.floor((data.max_entries * (data.winner_percentage ?? 0)) / 100);
  const bonusWinners      = Math.floor(totalWinners * 0.01);
  const refundWinners     = totalWinners - bonusWinners + 1;
  const cashbackAmount    = refundWinners * data.entry_fee;
  const cashback_percentage = (cashbackAmount / totalCollected) * 100;
  const netPrizePool      = netAfterFee - cashbackAmount;
  const prizeDistribution = data.prize_distribution ? JSON.stringify(data.prize_distribution) : null;

  const [result] = await db.query(
    `INSERT INTO contest
     (match_id, entry_fee, prize_pool, net_pool_prize, max_entries, min_entries, current_entries,
      contest_type, is_guaranteed, winner_percentage, total_winners,
      first_prize, prize_distribution, is_cashback,
      cashback_percentage, cashback_amount,
      platform_fee_percentage, platform_fee_amount, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      data.match_id, data.entry_fee, netPrizePool, netAfterFee,
      data.max_entries, data.min_entries ?? 0, 0,
      data.contest_type, data.is_guaranteed ?? 0,
      data.winner_percentage ?? 0, totalWinners,
      data.first_prize ?? 0, prizeDistribution,
      data.is_cashback ?? 0, cashback_percentage, cashbackAmount,
      data.platform_fee_percentage ?? 0, platformFeeAmount,
      data.status ?? "UPCOMING", new Date()
    ]
  );

  return { id: result.insertId };
};

export const getContests = async () => {
  const [rows] = await db.query(`SELECT * FROM contest ORDER BY created_at DESC`);
  return rows;
};

export const getContestById = async (id) => {
  const [[row]] = await db.query(`SELECT * FROM contest WHERE id = ?`, [id]);
  if (!row) throw new Error("Contest not found");
  return row;
};

export const updateContest = async (id, data) => {
  const contestId = parseInt(id, 10);
  if (isNaN(contestId)) throw new Error('Invalid contest id');

  const [[contest]] = await db.query(`SELECT * FROM contest WHERE id = ?`, [contestId]);
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
    prize_distribution:      data.prize_distribution !== undefined ? data.prize_distribution : contest.prize_distribution,
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
    cashback_percentage = totalCollected > 0 ? (cashbackAmount / totalCollected) * 100 : 0;
  }

  const netPrizePool = Math.max(0, netAfterFee - cashbackAmount);
  const prizeDistribution = merged.prize_distribution
    ? (typeof merged.prize_distribution === 'object'
        ? JSON.stringify(merged.prize_distribution)
        : merged.prize_distribution)
    : null;

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
      merged.entry_fee, merged.max_entries, merged.min_entries,
      merged.contest_type, merged.platform_fee_percentage, platformFeeAmount,
      merged.winner_percentage, totalWinners, netPrizePool, netAfterFee,
      merged.is_cashback, cashback_percentage, cashbackAmount,
      merged.first_prize, prizeDistribution, merged.is_guaranteed,
      merged.status, contestId,
    ]
  );

  if (result.affectedRows === 0) throw new Error('Contest update failed');
  return { id: contestId, updated: true };
};

export const getContestsByMatch = async (matchId) => {
  const [rows] = await db.query(
    `SELECT * FROM contest WHERE match_id = ? ORDER BY created_at DESC`,
    [matchId]
  );
  if (!rows.length) throw new Error("No contests found for match");
  return rows;
};

export const getContestsBySeries = async (seriesId) => {
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
};

export const getContestsByTeam = async (teamId) => {
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
};

//contest category

export const createContestCategory = async (data) => {
  const [result] = await db.query(
    `INSERT INTO contestcategory (name, percentage, entryfee, platformfee, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.percentage, data.entryfee, data.platformfee, new Date()]
  );
  return { id: result.insertId };
};

export const getContestcategory = async () => {
  const [rows] = await db.query(`SELECT * FROM contestcategory ORDER BY id DESC`);
  return rows;
};

//dashboard

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
      totalUserTeams:        Number(teamStats.totalUserTeams),
      totalUserTeamPlayers:  Number(teamStats.totalUserTeamPlayers),
    },
    contests,
  };
};

//deposites

export const getallDeposites = async () => {
  const [rows] = await db.query(`SELECT * FROM deposite ORDER BY id DESC`);
  if (!rows.length) throw new Error('No deposits found');
  return rows;
};

export const fetchDeposites = async (filters = {}) => {
  const { depositeType, status, minAmount, maxAmount, phone, startDate, endDate, transaction_id } = filters;

  const conditions = [];
  const params     = [];

  if (depositeType?.trim())    { conditions.push(`depositeType = ?`);    params.push(depositeType.trim()); }
  if (status?.trim())          { conditions.push(`status = ?`);          params.push(status.trim()); }
  if (phone?.trim())           { conditions.push(`phone = ?`);           params.push(phone.trim()); }
  if (transaction_id?.trim())  { conditions.push(`transaction_id = ?`);  params.push(transaction_id.trim()); }
  if (minAmount !== undefined && minAmount !== '') { conditions.push(`amount >= ?`); params.push(Number(minAmount)); }
  if (maxAmount !== undefined && maxAmount !== '') { conditions.push(`amount <= ?`); params.push(Number(maxAmount)); }
  if (startDate?.trim())       { conditions.push(`createdAt >= ?`);      params.push(new Date(startDate.trim())); }
  if (endDate?.trim())         { conditions.push(`createdAt <= ?`);      params.push(new Date(endDate.trim())); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.query(`SELECT * FROM deposite ${where} ORDER BY id DESC`, params);

  if (!rows.length) throw new Error('No deposits found');
  return rows;
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

//withdraws

export const getallWithdraws = async () => {
  const [rows] = await db.query(`SELECT * FROM withdraws ORDER BY id DESC`);
  if (!rows.length) throw new Error('No withdraws found');
  return rows;
};

export const fetchWithdraws = async (filters = {}) => {
  const { payment_mode, status, minAmount, maxAmount, phone, startDate, endDate, transaction_id } = filters;

  const conditions = [];
  const params     = [];

  if (payment_mode?.trim())    { conditions.push(`payment_mode = ?`);    params.push(payment_mode.trim()); }
  if (status?.trim())          { conditions.push(`status = ?`);          params.push(status.trim()); }
  if (phone?.trim())           { conditions.push(`phone = ?`);           params.push(phone.trim()); }
  if (transaction_id?.trim())  { conditions.push(`transaction_id = ?`);  params.push(transaction_id.trim()); }
  if (minAmount !== undefined && minAmount !== '') { conditions.push(`amount >= ?`); params.push(Number(minAmount)); }
  if (maxAmount !== undefined && maxAmount !== '') { conditions.push(`amount <= ?`); params.push(Number(maxAmount)); }
  if (startDate?.trim())       { conditions.push(`createdAt >= ?`);      params.push(new Date(startDate.trim())); }
  if (endDate?.trim())         { conditions.push(`createdAt <= ?`);      params.push(new Date(endDate.trim())); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.query(`SELECT * FROM withdraws ${where} ORDER BY id DESC`, params);

  if (!rows.length) throw new Error('No withdraws found');
  return rows;
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

//users

export const getallUsers = async () => {
  const [rows] = await db.query(`SELECT * FROM users ORDER BY id DESC`);
  if (!rows.length) throw new Error('No users found');       
  return rows;
};

export const fetchUsers = async (filters = {}) => {
  const { name, usedcode, email, mobile, account_status, kyc_status, userid, referalid } = filters;

  const conditions = [];
  const params     = [];

  if (userid)                  { conditions.push(`id = ?`);             params.push(Number(userid)); }
  if (referalid)               { conditions.push(`referalid = ?`);      params.push(Number(referalid)); }
  if (name?.trim())            { conditions.push(`name LIKE ?`);        params.push(`%${name.trim()}%`); }
  if (email?.trim())           { conditions.push(`email = ?`);          params.push(email.trim()); }
  if (mobile?.trim())          { conditions.push(`mobile = ?`);         params.push(mobile.trim()); }
  if (usedcode?.trim())        { conditions.push(`usedcode = ?`);       params.push(usedcode.trim()); }
  if (account_status?.trim())  { conditions.push(`account_status = ?`); params.push(account_status.trim()); }
  if (kyc_status?.trim())      { conditions.push(`kyc_status = ?`);     params.push(kyc_status.trim()); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await db.query(`SELECT * FROM users ${where} ORDER BY id DESC`, params);

  if (!rows.length) throw new Error('No users found');
  return rows;
};

export const fetchUsersByKycStatus = async (filters = {}) => {
  const { kyc_status } = filters;

  if (!kyc_status?.trim()) throw new Error('kyc_status is required'); 

  const [rows] = await db.query(
    `SELECT * FROM users WHERE kyc_status = ? ORDER BY id DESC`,
    [kyc_status.trim()]
  );

  if (!rows.length) throw new Error(`No users found with kyc_status: ${kyc_status}`);
  return rows;
};

export const fetchUsersByAccountStatus = async (filters = {}) => {
  const { account_status } = filters;

  if (!account_status?.trim()) throw new Error('account_status is required'); 

  const [rows] = await db.query(
    `SELECT * FROM users WHERE account_status = ? ORDER BY id DESC`,
    [account_status.trim()]
  );

  if (!rows.length) throw new Error(`No users found with account_status: ${account_status}`);
  return rows;
};