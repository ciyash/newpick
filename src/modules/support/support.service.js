import db from "../../config/db.js";
import { logActivity } from "../../utils/activity.logger.js";

const CATEGORY_LABELS = {
  wallet:      "Wallet Issues",
  withdrawal:  "Withdrawal Issues",
  kyc:         "KYC Issues",
  contest:     "Contest Issues",
  technical:   "Technical Support",
  bonus:       "Bonus Disputes",
  rg:          "RG Complaints",
};


const generateTicketNo = async (conn) => {
  const [[last]] = await conn.query(
    `SELECT ticket_no FROM support_tickets
    ORDER BY id DESC LIMIT 1`  
  );
  if (!last) return "TKT-1001";
  const num = parseInt(last.ticket_no.replace("TKT-", "")) + 1;
  return `TKT-${num}`;
};


export const raiseTicketService = async (userId, data) => {
  const { category, subject, message, priority } = data;

  if (!category) throw new Error("Category is required");
  if (!subject)  throw new Error("Subject is required");
  if (!message)  throw new Error("Message is required");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const ticketNo = await generateTicketNo(conn);

    const [result] = await conn.query(
      `INSERT INTO support_tickets
         (user_id, ticket_no, category, subject, message, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [userId, ticketNo, category, subject, message, priority || "Medium"]
    );

    const ticketId = result.insertId;

    // First message — ticket message table  
    await conn.query(
      `INSERT INTO support_ticket_messages
         (ticket_id, sender_id, sender_type, message)
       VALUES (?, ?, 'user', ?)`,
      [ticketId, userId, message]
    );

    await conn.commit();

    logActivity({
      userId,
      type:        "support",
      sub_type:    "ticket_raised",
      title:       "Support Ticket Raised",
      description: `Ticket ${ticketNo} raised — ${subject}`,
      icon:        "support",
    });

    return {
      success:   true,
      message:   "Ticket raised successfully",
      ticket_no: ticketNo,
      ticket_id: String(ticketId),
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

//  ======================================================



export const getMyTicketsService = async (userId, filters = {}) => {
  const { status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let whereClause = "WHERE user_id = ?";
  const params    = [userId];

  if (status !== undefined && status !== "") {
    whereClause += " AND status = ?";
    params.push(status);
  }

  const [rows] = await db.query(
    `SELECT id, ticket_no, category, subject, message,
            priority, status, created_at, updated_at
     FROM support_tickets
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM support_tickets ${whereClause}`,
    params
  );

  // ── Each ticket messages ──
  const data = await Promise.all(
    rows.map(async (t) => {
      const [messages] = await db.query(
        `SELECT sender_type, message, created_at
         FROM support_ticket_messages
         WHERE ticket_id = ?
         ORDER BY created_at ASC`,
       [String(t.id)] 
      );

      return {
        id:           String(t.id),
        ticket_no:    t.ticket_no,
        category:     t.category,
        category_label: CATEGORY_LABELS[t.category] || t.category,  
        subject:      t.subject,
        priority:     t.priority,
        status:       t.status,
        status_label: ["Pending", "Opened", "Reacted", "Resolved"][t.status] || "Pending",
        created_at:   t.created_at,
        updated_at:   t.updated_at,
        messages:     messages.map(m => ({
        sender_type: m.sender_type,
        message:     m.message,
        created_at:  m.created_at,
        })),
      };
    })
  );

  return {
    data,
    pagination: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
};



/* ======================================================
   USER — REPLY TO TICKET
====================================================== */

export const replyTicketService = async (userId, ticketNo, message) => {
  if (!message) throw new Error("Message is required");

  const [[ticket]] = await db.query(
    `SELECT * FROM support_tickets 
     WHERE ticket_no = ? AND user_id = ?`,
    [ticketNo, userId]
  );
  if (!ticket)             throw new Error("Ticket not found");
  if (ticket.status === 3) throw new Error("Ticket is already resolved");

  await db.query(
    `INSERT INTO support_ticket_messages
       (ticket_id, sender_id, sender_type, message)
     VALUES (?, ?, 'user', ?)`,
    [ticket.id, userId, message]
  );

  return { success: true, message: "Reply sent" };
};

/* ======================================================
   ADMIN — GET ALL TICKETS
====================================================== */
export const adminGetTicketsService = async (filters = {}) => {
  const { status, category, priority, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let where  = "WHERE 1=1";
  const params = [];

  if (status !== undefined && status !== "") {
    where += " AND t.status = ?";
    params.push(status);
  }
  if (category) {
    where += " AND t.category = ?";
    params.push(category);
  }
  if (priority) {
    where += " AND t.priority = ?";
    params.push(priority);
  }

  const [rows] = await db.query(
    `SELECT
       t.id, t.ticket_no, t.category, t.subject,
       t.priority, t.status, t.created_at, t.updated_at,
       u.name AS user_name, u.email AS user_email
     FROM support_tickets t
     JOIN users u ON u.id = t.user_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM support_tickets t ${where}`,
    params
  );

  return {
    data: rows.map(t => ({
      id:           String(t.id),
      ticket_no:    t.ticket_no,
      category:     t.category,
      subject:      t.subject,
      priority:     t.priority,
      status:       t.status,
      status_label: ["Pending", "Opened", "Reacted", "Resolved"][t.status] || "Pending",
      user_name:    t.user_name,
      user_email:   t.user_email,
      created_at:   t.created_at,
      updated_at:   t.updated_at,
    })),
    pagination: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
};

/* ======================================================
   ADMIN — UPDATE TICKET STATUS
====================================================== */
export const adminUpdateTicketStatusService = async (adminId, ticketId, status) => {
  if (![0, 1, 2, 3].includes(Number(status)))
    throw new Error("Invalid status. 0=Pending, 1=Opened, 2=Reacted, 3=Resolved");

  const [[ticket]] = await db.query(
    `SELECT * FROM support_tickets WHERE id = ?`,
    [ticketId]
  );
  if (!ticket) throw new Error("Ticket not found");

  await db.query(
    `UPDATE support_tickets SET status = ?, assigned_to = ? WHERE id = ?`,
    [status, adminId, ticketId]
  );

  return {
    success:      true,
    message:      "Ticket status updated",
    status:       Number(status),
    status_label: ["Pending", "Opened", "Reacted", "Resolved"][status],
  };
};

/* ======================================================
   ADMIN — REPLY TO TICKET
====================================================== */


export const adminReplyTicketService = async (adminId, ticketNo, message) => {
  if (!message) throw new Error("Message is required");

  const [[ticket]] = await db.query(
    `SELECT * FROM support_tickets WHERE ticket_no = ?`,
    [ticketNo]
  );
  if (!ticket)             throw new Error("Ticket not found");
  if (ticket.status === 3) throw new Error("Ticket is already resolved");

  await db.query(
    `INSERT INTO support_ticket_messages
       (ticket_id, sender_id, sender_type, message)
     VALUES (?, ?, 'admin', ?)`,
    [ticket.id, adminId, message]
  );

  // Status → 2 (Reacted)
  await db.query(
    `UPDATE support_tickets 
     SET status = 2, assigned_to = ? 
     WHERE ticket_no = ?`,
    [adminId, ticketNo]
  );

  return { success: true, message: "Reply sent" };
};