import db from "../../config/db.js";


const PACK_CONFIG = {
  "1M": { months: 1, price: 35, bonus: 5  },
  "3M": { months: 3, price: 100, bonus: 15 },
};

const getPeriod = (months) => {
  if (months === 1) return "monthly";
  if (months === 3) return "quarterly";
  return "monthly";
};


export const buySubscriptionServicechandu = async (userId, pack, meta = {}) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* ================================
       1️⃣ LOCK USER
    ================================= */
    const [[user]] = await conn.query(
      `SELECT
        subscribe,
        subscribeenddate,
        nextsubscribe,
        subscription_bonus_given,
        subscription_count
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!user) throw new Error("User not found");

    if (user.subscription_count >= 2) {
      throw new Error("Subscription allowed only 2 times");
    }

    /* ================================
       2️⃣ VALIDATE PACK
    ================================= */
    const config = PACK_CONFIG[pack];
    if (!config) throw new Error("Invalid pack");

    /* ================================
       3️⃣ LOCK WALLET
    ================================= */
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen === 1) throw new Error("Wallet frozen");

    const price = config.price;

    /* ================================
       ⭐ WALLET DEDUCTION
       EARN → DEPOSIT ONLY
       (BONUS NOT USED)
    ================================= */
    let remaining = price;

    const earnUse = Math.min(Number(wallet.earnwallet || 0), remaining);
    remaining -= earnUse;

    const depositUse = Math.min(Number(wallet.depositwallet || 0), remaining);
    remaining -= depositUse;

    remaining = Number(remaining.toFixed(2));

    if (remaining > 0) {
      throw new Error("Insufficient balance for subscription");
    }

    /* ================================
       4️⃣ UPDATE WALLET
    ================================= */
    await conn.query(
      `UPDATE wallets SET
         earnwallet = earnwallet - ?,
         depositwallet = depositwallet - ?
       WHERE user_id = ?`,
      [earnUse, depositUse, userId]
    );

    const referenceId = `SUB-${userId}-${Date.now()}`;

    /* ================================
       5️⃣ WALLET TRANSACTIONS
    ================================= */

    if (earnUse > 0) {
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount, reference_id, ip_address, device)
         VALUES (?, 'earn', 'debit', ?, ?, ?, ?, ?)`,
        [
          userId,
          `Subscription purchase (${pack})`,
          earnUse,
          referenceId,
          meta.ip || null,
          meta.device || null
        ]
      );
    }

    if (depositUse > 0) {
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount, reference_id, ip_address, device)
         VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?)`,
        [
          userId,
          `Subscription purchase (${pack})`,
          depositUse,
          referenceId,
          meta.ip || null,
          meta.device || null
        ]
      );
    }

    /* ================================
       6️⃣ ACTIVATE OR QUEUE
    ================================= */
    const now = new Date();
    const hasActive =
      user.subscribe === 1 &&
      user.subscribeenddate &&
      new Date(user.subscribeenddate) > now;

    let startDate, endDate;

    if (hasActive) {
      const expiryDate = new Date(user.subscribeenddate);
      const diffDays = (expiryDate - now) / (1000 * 60 * 60 * 24);

      if (diffDays > 5) {
        throw new Error("Next subscription allowed only within 5 days before expiry");
      }

      if (user.nextsubscribe === 1) {
        throw new Error("Next subscription already queued");
      }

      startDate = new Date(user.subscribeenddate);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + config.months);

      await conn.query(
        `UPDATE users SET
          nextsubscribe = 1,
          nextsubscribepack = ?,
          nextsubscribestartdate = ?,
          nextsubscribeenddate = ?
         WHERE id = ?`,
        [pack, startDate, endDate, userId]
      );

    } else {
      startDate = now;
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + config.months);

      await conn.query(
        `UPDATE users SET
          subscribe = 1,
          subscribepack = ?,
          subscribestartdate = ?,
          subscribeenddate = ?
         WHERE id = ?`,
        [pack, startDate, endDate, userId]
      );
    }

    /* ================================
       7️⃣ INCREMENT COUNT
    ================================= */
    await conn.query(
      `UPDATE users
       SET subscription_count = subscription_count + 1
       WHERE id = ?`,
      [userId]
    );

    /* ================================
       ⭐ FIRST SUB BONUS CREDIT
    ================================= */
    if (user.subscription_bonus_given === 0) {

      await conn.query(
        `UPDATE wallets
         SET bonusamount = bonusamount + ?
         WHERE user_id = ?`,
        [config.bonus, userId]
      );

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount, reference_id)
         VALUES (?, 'bonus', 'credit', ?, ?, ?)`,
        [
          userId,
          "Subscription Bonus",
          config.bonus,
          `SUBBONUS-${userId}-${Date.now()}`
        ]
      );

      await conn.query(
        `UPDATE users
         SET subscription_bonus_given = 1
         WHERE id = ?`,
        [userId]
      );
    }

    await conn.commit();

    return {
      success: true,
      message: hasActive
        ? "Subscription added to queue"
        : "Subscription activated",
      startDate,
      endDate,
      deduction: {
        earnUsed: earnUse,
        depositUsed: depositUse
      }  
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};




export const buySubscriptionService = async (userId, pack, meta = {}) => {
  let conn;

  // ─── Input Sanitization ───
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw new Error("Invalid user ID");
  }
  const safeUserId = userId;

  if (typeof pack !== "string" || !pack.trim()) {
    throw new Error("Invalid pack");
  }
  const safePack = pack.trim();

  const safeIp     = typeof meta.ip     === "string" ? meta.ip.slice(0, 45)     : null;
  const safeDevice = typeof meta.device === "string" ? meta.device.slice(0, 200) : null;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* ================================
       1️⃣ LOCK USER
    ================================= */
    const [[user]] = await conn.query(
      `SELECT
         subscribe, subscribeenddate, nextsubscribe,
         subscription_bonus_given, subscription_count
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [safeUserId]
    );
    if (!user) throw new Error("User not found");

    /* ================================
       2️⃣ VALIDATE PACK
    ================================= */
    const config = PACK_CONFIG[safePack];
    if (!config) throw new Error("Invalid pack");

    const price  = Number(config.price);
    const bonus  = Number(config.bonus  ?? 0);
    const months = Number(config.months ?? 0);

    if (!price  || price  <= 0) throw new Error("Invalid pack price");
    if (bonus   < 0)            throw new Error("Invalid pack bonus");
    if (!months || months <= 0) throw new Error("Invalid pack duration");

    /* ================================
       3️⃣ LOCK WALLET
    ================================= */
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [safeUserId]
    );
    if (!wallet)                      throw new Error("Wallet not found");
    if (Number(wallet.is_frozen) === 1) throw new Error("Wallet frozen");

    /* ================================
       4️⃣ VALIDATE SUBSCRIPTION STATE
    ================================= */
    const now      = new Date();
    const hasActive =
      Number(user.subscribe) === 1 &&
      user.subscribeenddate  &&
      new Date(user.subscribeenddate) > now;

    let startDate, endDate;

    if (hasActive) {
      if (Number(user.nextsubscribe) === 1) {
        throw new Error("Next subscription already queued");
      }

      const expiryDate = new Date(user.subscribeenddate);
      const diffDays   = (expiryDate - now) / (1000 * 60 * 60 * 24);

      if (diffDays > 5) {
        const availableFrom = new Date(expiryDate);
        availableFrom.setDate(availableFrom.getDate() - 5);
        const formatted = availableFrom.toLocaleDateString("en-GB", {
          day: "2-digit", month: "long", year: "numeric",
        });
        throw new Error(`Next subscription can be purchased from ${formatted}`);
      }

      startDate = new Date(user.subscribeenddate);
      endDate   = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
    } else {
      startDate = now;
      endDate   = new Date(now);
      endDate.setMonth(endDate.getMonth() + months);
    }

    if (isNaN(endDate.getTime())) {
      throw new Error("Failed to calculate subscription end date");
    }

    /* ================================
       5️⃣ WALLET DEDUCTION LOGIC
    ================================= */
    const earnBalance    = Number(wallet.earnwallet    || 0);
    const depositBalance = Number(wallet.depositwallet || 0);

    let remaining = price;

    const earnUse    = Math.min(earnBalance, remaining);
    remaining        = Number((remaining - earnUse).toFixed(2));

    const depositUse = Math.min(depositBalance, remaining);
    remaining        = Number((remaining - depositUse).toFixed(2));

    if (remaining > 0) {
      throw new Error("Insufficient balance for subscription");
    }

    /* ================================
       6️⃣ OPENING / CLOSING BALANCES
    ================================= */
    const bonusBalance = Number(wallet.bonusamount || 0);
    let userBalance    = Number((earnBalance + depositBalance + bonusBalance).toFixed(2));
    let bonusRunning   = bonusBalance;

    /* ================================
       7️⃣ GET COMPANY LAST BALANCE
    ================================= */
    const [[companyLast]] = await conn.query(
      `SELECT closing_balance
       FROM wallet_transactions
       WHERE closing_balance != 0
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`
    );
    let companyBalance = Number(companyLast?.closing_balance || 0);

    /* ================================
       8️⃣ UPDATE WALLET BALANCES
    ================================= */
    const [walletUpdate] = await conn.query(
      `UPDATE wallets SET
         earnwallet    = earnwallet    - ?,
         depositwallet = depositwallet - ?
       WHERE user_id = ?
         AND earnwallet    >= ?
         AND depositwallet >= ?`,
      [earnUse, depositUse, safeUserId, earnUse, depositUse]
    );
    if (walletUpdate.affectedRows === 0) {
      throw new Error("Insufficient balance for subscription");
    }

    /* ================================
       9️⃣ REFERENCE IDs
    ================================= */
    const referenceId      = `SUB-${safeUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const bonusReferenceId = `SUBBONUS-${safeUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    /* ================================
       🔟 WALLET TRANSACTIONS
    ================================= */

    // ── Row 1: Earn wallet debit ──
    if (earnUse > 0) {
      const uOpen   = userBalance;
      const uClose  = Number((userBalance    - earnUse).toFixed(2));
      userBalance   = uClose;

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance + earnUse).toFixed(2));
      companyBalance = coClose;

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance,    closing_balance,
          reference_id, ip_address, device)
         VALUES (?, 'subscribe', 'debit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safeUserId,
          `Subscription purchase (${safePack})`,
          earnUse,
          uOpen, uClose,
          coOpen, coClose,
          referenceId, safeIp, safeDevice,
        ]
      );
    }

    // ── Row 2: Deposit wallet debit ──
    if (depositUse > 0) {
      const uOpen   = userBalance;
      const uClose  = Number((userBalance    - depositUse).toFixed(2));
      userBalance   = uClose;

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance + depositUse).toFixed(2));
      companyBalance = coClose;

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance,    closing_balance,
          reference_id, ip_address, device)
         VALUES (?, 'subscribe', 'debit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          safeUserId,
          `Subscription purchase (${safePack})`,
          depositUse,
          uOpen, uClose,
          coOpen, coClose,
          referenceId, safeIp, safeDevice,
        ]
      );
    }

    // ── Row 3: Bonus credit (first sub only) ──
    if (Number(user.subscription_bonus_given) === 0 && bonus > 0) {
      const uOpen   = bonusRunning;
      const uClose  = Number((bonusRunning   + bonus).toFixed(2));
      bonusRunning  = uClose;

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance - bonus).toFixed(2));
      companyBalance = coClose;

      await conn.query(
        `UPDATE wallets SET bonusamount = bonusamount + ? WHERE user_id = ?`,
        [bonus, safeUserId]
      );

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance,    closing_balance,
          reference_id)
         VALUES (?, 'bonus', 'credit', ?, ?, ?, ?, ?, ?, ?)`,
        [
          safeUserId,
          `Subscription bonus (${safePack})`,
          bonus,
          uOpen, uClose,
          coOpen, coClose,
          bonusReferenceId,
        ]
      );

      await conn.query(
        `UPDATE users SET subscription_bonus_given = 1 WHERE id = ?`,
        [safeUserId]
      );
    }

    /* ================================
       1️⃣1️⃣ ACTIVATE OR QUEUE SUBSCRIPTION
    ================================= */
    if (hasActive) {
      await conn.query(
        `UPDATE users SET
           nextsubscribe          = 1,
           nextsubscribepack      = ?,
           nextsubscribestartdate = ?,
           nextsubscribeenddate   = ?
         WHERE id = ?`,
        [safePack, startDate, endDate, safeUserId]
      );
    } else {
      await conn.query(
        `UPDATE users SET
           subscribe          = 1,
           subscribepack      = ?,
           subscribestartdate = ?,
           subscribeenddate   = ?
         WHERE id = ?`,
        [safePack, startDate, endDate, safeUserId]
      );
    }

    // ✅ subscriptions table లో insert
    await conn.query(
      `INSERT INTO subscriptions
       (user_id, package_name, amount, period, status,
        subscription_date, subscription_end, renewal_count,
        auto_renew, discount, final_amount, remark,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, 'success', ?, ?, 0, 0, 0.00, ?, ?, NOW(), NOW())`,
      [
        safeUserId,
        safePack,
        price,
        getPeriod(months),
        startDate,
        endDate,
        price,
        hasActive
          ? `Queued subscription (${safePack})`
          : `New subscription (${safePack})`,
      ]
    );

    /* ================================
       1️⃣2️⃣ INCREMENT SUBSCRIPTION COUNT
    ================================= */
    await conn.query(
      `UPDATE users SET subscription_count = subscription_count + 1 WHERE id = ?`,
      [safeUserId]
    );

    await conn.commit();

    return {
      success:   true,
      message:   hasActive ? "Subscription added to queue" : "Subscription activated",
      startDate,
      endDate,
      deduction: {
        earnUsed:   earnUse,
        depositUsed: depositUse,
        bonusGiven: Number(user.subscription_bonus_given) === 0 ? bonus : 0,
      },
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};



export const getSubscriptionStatusService = async (userId) => {
  const [[user]] = await db.query(
    `SELECT
       u.subscribe,
       u.subscribepack,
       u.subscribestartdate,
       u.subscribeenddate,
       s.id AS subscription_id,
       s.package_name,
       s.amount,
       s.period,
       s.final_amount,
       s.remark,
       s.status AS sub_status
     FROM users u
     LEFT JOIN subscriptions s
       ON s.user_id = u.id
       AND s.package_name = u.subscribepack
     WHERE u.id = ?
     ORDER BY s.id DESC
     LIMIT 1`,
    [userId]
  );

  if (!user || user.subscribe !== 1 || !user.subscribeenddate) {
    return { active: false, message: "No active subscription" };
  }

  const now = new Date();
  if (new Date(user.subscribeenddate) < now) {
    return { active: false, message: "Your subscription expired" };
  }

  return {
    active: true,
    current: {
      pack: user.subscribepack,
      startDate: user.subscribestartdate,
      endDate: user.subscribeenddate,
      packageDetails: {
        id: user.subscription_id,
        name: user.package_name,
        amount: user.amount,
        final_amount: user.final_amount,
        period: user.period,
        status: user.sub_status,
        remark: user.remark
      }
    }
  };
};
  
export const getAllPackages = async () => {
    try {
        const query = 'SELECT * FROM subscription_packages ORDER BY id ASC';
        const [rows] = await db.execute(query);
        return rows;
    } catch (error) {
        throw error;
    }
};


