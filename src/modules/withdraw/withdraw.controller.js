import {
  requestWithdrawService,
  approveWithdrawService,
  rejectWithdrawService,
  getMyWithdrawRequestsService,
  getAllWithdrawRequestsService
} from "./withdraw.service.js";

/* User */
export const requestWithdraw = async (req, res) => {
  try {
    const userId = req.user.id;
    const response = await requestWithdrawService(userId, req.body);
    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const approveWithdraw = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { withdrawId } = req.body;

    if (!withdrawId) {
      return res.status(400).json({ success: false, message: "withdrawId is required" });
    }

    const response = await approveWithdrawService(adminId, String(withdrawId));
    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const rejectWithdraw = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const { withdrawId, remarks } = req.body;

    if (!withdrawId) {
      return res.status(400).json({ success: false, message: "withdrawId is required" });
    }

    const response = await rejectWithdrawService(adminId, String(withdrawId), remarks);
    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getMyWithdrawRequests = async (req, res) => {
  try {

    const userId = req.user.id;

    const withdraws = await getMyWithdrawRequestsService(userId);

    res.json({
      success: true,
      data: withdraws
    });

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }
};  


export const getAllWithdrawRequests = async (req, res) => {
  try {
    const { status, page, limit } = req.query;
    const result = await getAllWithdrawRequestsService({ status, page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};