import express from "express";
import {
  raiseTicket,
  getMyTickets,
  replyTicket,
  adminGetTickets,
  adminUpdateTicketStatus,
  adminReplyTicket,
} from "./support.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

/* ── USER ── */

router.post("/raise",                     authenticate, checkAccountActive, raiseTicket);
router.get("/my-tickets",                 authenticate, getMyTickets);
router.post("/reply/:ticket_no",           authenticate, replyTicket);

/* ── ADMIN ── */

router.get("/admin/all",                  adminAuth(), adminGetTickets);
router.post("/admin/update-status",       adminAuth(), adminUpdateTicketStatus);
router.post("/admin/reply/:ticket_no",     adminAuth(), adminReplyTicket);

export default router;

