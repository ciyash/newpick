import {
  raiseTicketService,
  getMyTicketsService,
  getTicketMessagesService,
  replyTicketService,
  adminGetTicketsService,
  adminUpdateTicketStatusService,
  adminReplyTicketService,
} from "./support.service.js";

export const raiseTicket = async (req, res) => {
  try {
    const result = await raiseTicketService(req.user.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getMyTickets = async (req, res) => {
  try {
    const result = await getMyTicketsService(req.user.id, req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getTicketMessages = async (req, res) => {
  try {
    const result = await getTicketMessagesService(req.user.id, req.params.ticketId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const replyTicket = async (req, res) => {
  try {
    const result = await replyTicketService(req.user.id, req.params.ticketId, req.body.message);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const adminGetTickets = async (req, res) => {
  try {
    const result = await adminGetTicketsService(req.query);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const adminUpdateTicketStatus = async (req, res) => {
  try {
    const { ticketId, status } = req.body;
    const result = await adminUpdateTicketStatusService(req.admin.id, ticketId, status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const adminReplyTicket = async (req, res) => {
  try {
    const result = await adminReplyTicketService(req.admin.id, req.params.ticketId, req.body.message);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};