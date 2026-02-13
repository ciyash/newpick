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

export const createAdmin = async (data, admin, ip) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [exists] = await conn.query(
      "SELECT id FROM admin WHERE email = ?",
      [data.email]
    );
    if (exists.length) throw new Error("Admin already exists");

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
   const [res] = await db.query(
      `INSERT INTO series
       (name,season,start_date,end_date,provider_series_id,created_at)
       VALUES (?,?,?,?,?, NOW())`,
      [
        data.name,
        data.season,
        data.start_date,
        data.end_date,
        data.provider_series_id
      ]
    );

    await logAdmin(db, admin, "CREATE_SERIES", "series", res.insertId, ip);
    return { id: res.insertId };
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
    const [[row]] = await db.query(`SELECT * FROM series WHERE id=?`, [id]);
    if (!row) throw new Error("Series not found");
    return row;
  } catch (err) {
    throw err;
  }
};

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
   const [res] = await db.query(
      `INSERT INTO matches
       (series_id,home_team_id,away_team_id,start_time,status,created_at)
       VALUES (?,?,?,?, 'UPCOMING', NOW())`,
      [
        data.series_id,
        data.home_team_id,
        data.away_team_id,
        data.start_time
      ]
    );

    await logAdmin(db, admin, "CREATE_MATCH", "match", res.insertId, ip);
    return { id: res.insertId };
  } catch (err) {
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
      `INSERT INTO teams
       (name,short_name,created_at)
       VALUES (?,?, NOW())`,
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
    const [res] = await db.query(
      `INSERT INTO players
       (team_id,name,position,created_at)
       VALUES (?,?,?, NOW())`,
      [data.team_id, data.name, data.position]
    );

    await logAdmin(db, admin, "CREATE_PLAYER", "player", res.insertId, ip);
    return { id: res.insertId };
  } catch (err) {
    throw err;
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
