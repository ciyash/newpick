import db from "../../config/db.js";

import { getSubscriptionStatusService } from "./subscription.service.js";
import { logActivity } from "../../utils/activity.logger.js";



export const getUserProfileService = async (userId) => {

  /* ═══════════════════════ 1. USER ═══════════════════════ */
  const [[user]] = await db.query(
    `SELECT
        userid, usercode,
        name, email, mobile, nickname, region,
        category, dob, created_at,
        last_login, current_login,
        last_login_ip, current_login_ip,
        issofverify, kyc_status,
        mobile_verify, email_verify,
        account_status,
        subscribe, subscribepack,
        subscribestartdate, subscribeenddate
     FROM users
     WHERE id = ?`,
    [userId]
  );

  if (!user) throw new Error("User not found");

  const generateNickname = (fullName) => {
    if (!fullName) return null;
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 8);
    return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}`;
  };

  /* ═══════════════════════ 2. WALLET ═══════════════════════ */

  const [[wallet]] = await db.query(
    `SELECT iskyc, issofverify, limit_reduced_once
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  const safeWallet = wallet || { iskyc: 0, issofverify: 0, limit_reduced_once: 0 };

  /* ═══════════════════════ 3. SUBSCRIPTION ═══════════════════════ */

  const now      = new Date();
  const isActive =
    Number(user.subscribe) === 1 &&
    user.subscribeenddate &&
    new Date(user.subscribeenddate) > now;

  const [allPlans] = await db.query(
    `SELECT id, package_name, amount, bonus, duration
     FROM subscription_packages
     WHERE LOWER(status) = 'active'
     ORDER BY amount ASC`
  );

  const currentPack = isActive
    ? allPlans.find((p) => p.duration === user.subscribepack) || null
    : null;

  /* ═══════════════════════ RETURN ═══════════════════════ */

  return {

    personal: {
      userid:        user.userid,
      usercode:      user.usercode,
      name:          user.name,
      email:         user.email,
      mobile:        user.mobile,
      nickname:      user.nickname || generateNickname(user.name),
      region:        user.region,
      dob:           user.dob,
      accountStatus: user.account_status,
      isActive:      user.account_status === "active",
      category:      user.category,
      memberSince:   user.created_at,
      mobileVerify:  user.mobile_verify,
      emailVerify:   user.email_verify,
      SOFverify:     user.issofverify,
      KYCstatus:     user.kyc_status,
      KYCverify:     safeWallet.iskyc,
      Walletlimit:   safeWallet.limit_reduced_once,
      lastLoginDate: user.last_login
        ? new Date(user.last_login).toLocaleString("en-GB")
        : "First login",
      lastLoginIp:      user.last_login_ip    || null,
      currentLoginDate: user.current_login
        ? new Date(user.current_login).toLocaleString("en-GB")
        : null,
      currentLoginIp:   user.current_login_ip || null,
    },

    subscription: {
      isActive,
      current: currentPack
        ? {
            packageName: currentPack.package_name,
            price:       Number(currentPack.amount),
            currency:    "GBP",
            bonus:       Number(currentPack.bonus),
            duration:    currentPack.duration,
            startAt:     user.subscribestartdate,
            endAt:       user.subscribeenddate,
          }
        : null,
      plans: allPlans.map((p) => ({
        id:          p.id,
        packageName: p.package_name,
        amount:      Number(p.amount),
        bonus:       Number(p.bonus),
        duration:    p.duration,
      })),
    },

  };
};


export const reduceMonthlyLimitService = async (userId, newLimit) => {

  /* --------------------------------
     1️⃣ FETCH USER + CURRENT LIMIT + FLAG
  -------------------------------- */
  const [[data]] = await db.query(
    `SELECT u.category,
            w.deposit_limit,
            w.limit_reduced_once
     FROM users u
     JOIN wallets w ON u.id = w.user_id
     WHERE u.id = ?`,
    [userId]
  );

  if (!data) throw new Error("User not found");

  const currentLimit = Number(data.deposit_limit);

  /* --------------------------------
     ⭐ PERMANENT BLOCK (LIFETIME)
  -------------------------------- */
  if (data.limit_reduced_once) {
    throw new Error(
      "Monthly limit can be reduced only once in your account lifetime"
    );
  }

  /* --------------------------------
     2️⃣ CATEGORY DEFAULT LIMIT
  -------------------------------- */
  const normalizedCategory =
    String(data.category || "").toLowerCase();

  const DEFAULT_LIMIT =
    normalizedCategory === "student" ? 500 : 1500;

  /* --------------------------------
     3️⃣ VALIDATIONS
  -------------------------------- */

  if (newLimit < 100) {
    throw new Error("Minimum allowed limit is £100");
  }

  if (newLimit > DEFAULT_LIMIT) {
    throw new Error(
      `Maximum allowed limit for your account is £${DEFAULT_LIMIT}`
    );
  }

  if (newLimit > currentLimit) {
    throw new Error("Limit increase is not allowed");
  }

  if (newLimit === currentLimit) {
    throw new Error("New limit must be lower than current limit");
  }

  /* --------------------------------
     4️⃣ UPDATE LIMIT + PERMANENT FLAG
  -------------------------------- */
  await db.query(
    `UPDATE wallets
     SET deposit_limit = ?,
         limit_reduced_once = TRUE
     WHERE user_id = ?`,
    [newLimit, userId]
  );

  logActivity({
    userId,
    type:        "profile",
    sub_type:    "limit_reduced",
    title:       "Deposit Limit Reduced",
    description: `Monthly deposit limit reduced to £${newLimit}`,
    icon:        "profile",
    meta:        { newLimit },
  });
};

   

// feedback service...........................................

export const createFeedbackService = async (userId, data) => {
  const { subject, message, rating, description } = data;

  await db.query(
    `INSERT INTO feedbacks
     (user_id, subject, message, rating, description)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId,
      subject,
      message,
      rating,
      description || null
    ]
  );

  logActivity({
    userId,
    type:        "profile",
    sub_type:    "feedback_submitted",
    title:       "Feedback Submitted",
    description: subject,
    icon:        "feedback",
  });

  return {
    success: true,
    message: "Feedback submitted successfully"
  };
};


export const getMyFeedbacksService = async (userId) => {
  const [rows] = await db.query(
    `SELECT
        id,
        subject,
        message,
        rating,
        description,
        created_at
     FROM feedbacks
     WHERE user_id = ?
     ORDER BY id DESC`,
    [userId]
  );

  return rows;
};


export const getUserPreferencesService = async (userId) => {
  const [[prefs]] = await db.query(
    `SELECT 
        sms_notifications,
        email_notifications,
        marketing_messages
     FROM users
     WHERE id = ?`,
    [userId]
  );

  if (!prefs) {
    throw new Error("User not found");
  }

  return {
    success: true,
    data: {
      sms_notifications: prefs.sms_notifications,
      email_notifications: prefs.email_notifications,
      marketing_messages: prefs.marketing_messages,
    },
  };
};


export const updateUserPreferencesService = async (
  userId,
  data
) => {
  const {
    sms_notifications,
    email_notifications,
    marketing_messages,
  } = data;

  await db.query(
    `UPDATE users
     SET 
       sms_notifications = ?,
       email_notifications = ?,
       marketing_messages = ?
     WHERE id = ?`,
    [
      sms_notifications ?? 0,
      email_notifications ?? 0,
      marketing_messages ?? 0,
      userId,
    ]
  );

  return {
    success: true,
    message: "Preferences updated successfully",
  };
};
