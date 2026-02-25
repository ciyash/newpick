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
    const prizeDistribution = data.prize_distribution
      ? JSON.stringify(data.prize_distribution)
      : null;

    const [res] = await db.query(
      `INSERT INTO contest
       (match_id, entry_fee, prize_pool, max_entries, min_entries, current_entries,
        contest_type, is_guaranteed, winner_percentage, total_winners,
        first_prize, prize_distribution, is_cashback,
        cashback_percentage, cashback_amount,
        platform_fee_percentage, platform_fee_amount,
        status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.match_id,
        data.entry_fee,
        data.prize_pool,
        data.max_entries,
        data.min_entries ?? 0,
        0,
        data.contest_type ,
        data.is_guaranteed ?? 0,
        data.winner_percentage ?? 0,
        data.total_winners ?? 0,
        data.first_prize ?? 0,
        prizeDistribution,
        data.is_cashback ?? 0,
        data.cashback_percentage ?? 0,
        data.cashback_amount ?? 0,
        data.platform_fee_percentage ?? 0,
        data.platform_fee_amount ?? 0,
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
    const [res] = await db.query(
      `UPDATE contest SET ? WHERE id = ?`,
      [data, id]
    );

    if (!res.affectedRows) throw new Error("Contest not found");
    return true;
  } catch (err) {
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