// home.ws.js — Socket.io namespace for the Home screen
// Handles: JWT auth, initial data push, 30s heartbeat, broadcast on data change
import jwt from "jsonwebtoken";
import db from "../../config/db.js";
import redis from "../../config/redis.js";

const HEARTBEAT_MS = 30_000;

/* ── Fetch live/upcoming matches with series info ── */
async function fetchHomeData() {
  const [rows] = await db.execute(`
    SELECT
      m.id,
      m.provider_match_id,
      m.start_time,
      m.status,
      m.matchdate,
      m.lineupavailable,
      s.id   AS series_id,
      s.name AS series_name,
      ht.short_name AS home_team_name,
      at.short_name AS away_team_name,
      COUNT(c.id)   AS total_contests
    FROM matches m
    JOIN series s  ON m.series_id  = s.seriesid
    JOIN teams  ht ON m.home_team_id = ht.id
    JOIN teams  at ON m.away_team_id = at.id
    LEFT JOIN contest c ON c.match_id = m.id
    WHERE m.status IN ('LIVE', 'UPCOMING')
    GROUP BY
      m.id, m.provider_match_id, m.start_time, m.status,
      m.matchdate, m.lineupavailable,
      s.id, s.name, ht.short_name, at.short_name
    ORDER BY m.start_time ASC
  `);
  return rows;
}

/* ── Verify JWT and check Redis blacklist ── */
async function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return null;
  }
  const blacklisted = await redis.get(`BLACKLIST:${token}`);
  if (blacklisted) return null;
  return payload;
}

/* ── Register the /home namespace on the socket.io server ── */
export function registerHomeNamespace(io) {
  const ns = io.of("/home");

  ns.use(async (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token) return next(new Error("AUTH_REQUIRED"));

    const payload = await verifyToken(token);
    if (!payload) return next(new Error("AUTH_INVALID"));

    socket.userId = payload.id ?? payload.userId;
    next();
  });

  ns.on("connection", async (socket) => {
    // ── Send initial data immediately on connect ──
    try {
      const matches = await fetchHomeData();
      socket.emit("home:data", { success: true, data: matches });
    } catch (err) {
      socket.emit("home:data", { success: false, message: "Failed to load matches" });
    }

    // ── 30-second heartbeat ──
    const heartbeat = setInterval(() => {
      if (socket.connected) socket.emit("home:ping", { ts: Date.now() });
    }, HEARTBEAT_MS);

    socket.on("home:pong", () => {
      // client is alive — no action needed
    });

    // ── Client requests a manual refresh ──
    socket.on("home:refresh", async () => {
      try {
        const matches = await fetchHomeData();
        socket.emit("home:data", { success: true, data: matches });
      } catch (err) {
        socket.emit("home:data", { success: false, message: "Refresh failed" });
      }
    });

    socket.on("disconnect", () => {
      clearInterval(heartbeat);
    });
  });

  return ns;
}

/* ── Broadcast updated home data to all connected clients ──
   Call this from cron jobs or match-status update handlers.    */
let _ns = null;
export function setHomeNamespace(ns) { _ns = ns; }

export async function broadcastHomeUpdate() {
  if (!_ns) return;
  try {
    const matches = await fetchHomeData();
    _ns.emit("home:data", { success: true, data: matches });
  } catch {
    // silent — next heartbeat will retry
  }
}
