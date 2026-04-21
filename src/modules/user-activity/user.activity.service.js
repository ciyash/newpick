import db from "../../config/db.js"; // adjust path as needed

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20; // records shown without full-history approval

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check whether a user currently has an approved full-history request
 * that has not yet expired (valid for 24 h after approval).
 */
export const checkFullHistoryApproval = async (userId) => {
  const [[row]] = await db.query(
    `SELECT id FROM full_history_requests
     WHERE user_id   = ?
       AND status    = 'approved'
       AND expires_at > NOW()
     LIMIT 1`,
    [userId]
  );
  return !!row;
};

// ── Service: Get My Activity ───────────────────────────────────────────────

/**
 * Returns paginated activity log for a user.
 *
 * @param {number}  userId
 * @param {object}  opts
 * @param {string|null} opts.type        - filter by activity type
 * @param {boolean}     opts.fullHistory - return all records or just recent
 * @param {number}      opts.page        - 1-based page number (default 1)
 * @param {number}      opts.limit       - records per page (default 20)
 */
export const getMyActivityService = async (userId, opts = {}) => {
  const { type = null, fullHistory = false, page = 1, limit = DEFAULT_LIMIT } = opts;

  const offset = (Math.max(1, page) - 1) * limit;

  // Build WHERE clause
  const conditions = ["user_id = ?"];
  const params     = [userId];

  if (type) {
    conditions.push("type = ?");
    params.push(type);
  }

  const where = conditions.join(" AND ");

  // Total count (for pagination meta)
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM user_activity_log WHERE ${where}`,
    params
  );

  // Actual rows
  let rowQuery = `
    SELECT
      id,
      user_id,
      type,
      sub_type,
      title,
      description,
      amount,
      meta,
      icon,
      created_at
    FROM user_activity_log
    WHERE ${where}
    ORDER BY created_at DESC
  `;

  const rowParams = [...params];

  if (!fullHistory) {
    // Without approval: return only the most recent N records
    rowQuery += ` LIMIT ?`;
    rowParams.push(DEFAULT_LIMIT);
  } else {
    rowQuery += ` LIMIT ? OFFSET ?`;
    rowParams.push(limit, offset);
  }

  const [activities] = await db.query(rowQuery, rowParams);

  // Parse JSON meta if stored as string
  const parsed = activities.map((row) => ({
    ...row,
    meta: parseJson(row.meta),
  }));

  return {
    activities: parsed,
    pagination: fullHistory
      ? {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        }
      : {
          total: parsed.length,
          note: `Showing latest ${DEFAULT_LIMIT} records. Request full history for complete access.`,
        },
  };
};

// ── Service: Request Full History ──────────────────────────────────────────

/**
 * Creates or reuses a pending full-history request for the user.
 * Throws with { code, message } if already pending/approved.
 */
export const requestFullHistoryService = async (userId) => {
  // Check for an existing pending request
  const [[pending]] = await db.query(
    `SELECT id, status FROM full_history_requests
     WHERE user_id = ?
       AND status IN ('pending', 'approved')
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [userId]
  );

  if (pending) {
    const err = new Error(
      pending.status === "approved"
        ? "You already have an active full-history approval."
        : "A full-history request is already pending admin review."
    );
    err.code = 409;
    throw err;
  }

  await db.query(
    `INSERT INTO full_history_requests (user_id, status, created_at)
     VALUES (?, 'pending', NOW())`,
    [userId]
  );
};

// ── Service: Approve / Reject Full History (Admin) ─────────────────────────

/**
 * Admin approves or rejects a full-history request.
 *
 * @param {number} requestId
 * @param {'approved'|'rejected'} action
 */
export const approveFullHistoryService = async (requestId, action) => {
  const validActions = ["approved", "rejected"];
  if (!validActions.includes(action)) {
    const err = new Error(`Invalid action. Must be one of: ${validActions.join(", ")}`);
    err.code = 400;
    throw err;
  }

  const [[request]] = await db.query(
    `SELECT id, status FROM full_history_requests WHERE id = ?`,
    [requestId]
  );

  if (!request) {
    const err = new Error("Request not found.");
    err.code = 404;
    throw err;
  }

  if (request.status !== "pending") {
    const err = new Error(`Request is already ${request.status}.`);
    err.code = 409;
    throw err;
  }

  // Approved requests expire after 24 hours
  const expiresAt =
    action === "approved"
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ")
      : null;

  await db.query(
    `UPDATE full_history_requests
     SET status     = ?,
         expires_at = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [action, expiresAt, requestId]
  );
};

// ── Utility ────────────────────────────────────────────────────────────────

function parseJson(value) {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}



// ── Add this to your user.activity.service.js ──

/**
 * Get all full history requests (admin view)
 * @param {'pending'|'approved'|'rejected'|null} status - filter by status
 */
export const getFullHistoryRequestsService = async (status = null) => {
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push("r.status = ?");
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [requests] = await db.query(
    `SELECT
       r.id,
       r.user_id,
       u.name        AS user_name,
       u.email       AS user_email,
       u.mobile      AS user_mobile,
       r.status,
       r.expires_at,
       r.created_at,
       r.updated_at
     FROM full_history_requests r
     JOIN users u ON u.id = r.user_id
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );

  return { requests, total: requests.length };
};

// ── Add this to your user.activity.controller.js ──


export const getFullHistoryRequests = async (req, res) => {
  try {
    const { status = null } = req.query;

    const validStatuses = ["pending", "approved", "rejected"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Valid: ${validStatuses.join(", ")}`,
      });
    }

    const result = await getFullHistoryRequestsService(status);

    return res.status(200).json({ success: true, ...result });

  } catch (err) {
    console.error("getFullHistoryRequests error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};


