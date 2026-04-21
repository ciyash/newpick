import db from "../config/db.js";


/**
 * Log any user activity
 * @param {object} opts
 */
export const logActivity = async ({
  userId,
  type,
  sub_type = null,
  title,
  description = null,
  amount = null,
  meta = null,
  icon = null,
}) => {
  try {
    await db.query(
      `INSERT INTO user_activity_log
        (user_id, type, sub_type, title, description, amount, meta, icon, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        type,
        sub_type,
        title,
        description,
        amount,
        meta ? JSON.stringify(meta) : null,
        icon,
      ]
    );
  } catch (err) {
    console.error("logActivity error:", err.message);
    // activity log fail ainappatiki main flow block kaakunda silent fail
  }
};