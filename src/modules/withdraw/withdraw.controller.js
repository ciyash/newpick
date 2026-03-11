import {
  requestWithdrawService,
  approveWithdrawService,
  rejectWithdrawService,
  getMyWithdrawRequestsService
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

/* Admin Approve */
export const approveWithdraw = async (req, res) => {
  try {
   const adminId = req.admin.id;
    const { withdrawId } = req.body;

    const response = await approveWithdrawService(adminId, withdrawId);
    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/* Admin Reject */
export const rejectWithdraw = async (req, res) => {
  try {
   const adminId = req.admin.id;
    const { withdrawId, remarks } = req.body;

    const response = await rejectWithdrawService(
      adminId,
      withdrawId,
      remarks
    );

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