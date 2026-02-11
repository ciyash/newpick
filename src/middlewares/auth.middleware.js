// import jwt from "jsonwebtoken";

// export const authenticate = (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;

//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       return res.status(401).json({
//         success: false,
//         message: "Authorization token missing",
//       });
//     }

//     const token = authHeader.split(" ")[1];

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded;

//     next();
//   } catch (err) {
//     return res.status(401).json({
//       success: false,
//       message: "Invalid or expired token",
//     });
//   }
// };


import jwt from "jsonwebtoken";
import db from "../config/db.js"; 



export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing"
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();

  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};

export const checkAccountActive = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [[user]] = await db.query(
      `SELECT account_status, pause_end
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    /* --------------------------------
       🚫 SOFT DELETE BLOCK
    -------------------------------- */
    if (user.account_status === "deleted") {
      return res.status(403).json({
        success: false,
        message: "Your account has been deleted. Please contact support."
      });
    }

    /* --------------------------------
       🔄 AUTO RESUME IF PAUSE EXPIRED
    -------------------------------- */
    if (
      user.account_status === "paused" &&
      user.pause_end &&
      new Date(user.pause_end) <= new Date()
    ) {
      await db.query(
        `UPDATE users
         SET account_status = 'active',
             pause_start = NULL,
             pause_end = NULL
         WHERE id = ?`,
        [userId]
      );

      return next();
    }

    /* --------------------------------
       🚫 BLOCK IF STILL PAUSED
    -------------------------------- */
    if (user.account_status === "paused") {
      return res.status(403).json({
        success: false,
        message: "Your account is temporarily paused",
        pausedTill: user.pause_end
      });
    }

    /* --------------------------------
       ✅ ACTIVE
    -------------------------------- */
    next();

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Account check failed"
    });
  }
};




