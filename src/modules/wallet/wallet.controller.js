import {addDepositService,  getMyWalletService,getMyTransactionsService} from "./wallet.service.js";

export const addMoney = async (req, res) => {
  try {
    const userId = req.user.id;   // ✅ from JWT
    const { amount } = req.body;

    const result = await addDepositService(userId, amount);

    res.json({
      success: true,
      addedAmount: result.added,
      remainingMonthlyLimit: result.remainingMonthlyLimit
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};



export const getMyWallet = async (req, res) => {
  try {
    const userId = req.user.id; // 🔐 from JWT

    const wallet = await getMyWalletService(userId);

    res.status(200).json({
      success: true,
      data: wallet
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

export const getMyTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const transactions = await getMyTransactionsService(userId);

    res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};