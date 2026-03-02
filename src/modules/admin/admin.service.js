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
//matches
export const createMatch = async (data, admin, ip) => {

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
  if (!admin?.id || !admin?.email) throw new Error("Invalid admin context");
  const points        = data.points        ?? 0;
  const playercredits = data.playercredits ?? 0;

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

export const createContest = async (data, admin, ip) => {

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
      `SELECT id FROM contest_category WHERE contest_type = ?`,
      [data.contest_type]
    );
    if (!category) throw new Error(`Invalid contest_type — '${data.contest_type}' not found in contest categories`);

    const [[existing]] = await conn.query(
      `SELECT id FROM contest WHERE match_id = ? AND contest_type = ?`,
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

export const createContestold = async (data, admin, ip) => {

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
      `SELECT id FROM contest_category WHERE contest_type = ?`,
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
        `SELECT id FROM contest_category WHERE contest_type = ?`,
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