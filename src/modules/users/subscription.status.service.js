export const getSubscriptionStatusService = async (userId) => {
  const [[user]] = await db.query(
    `SELECT subscribe, subscribeenddate, subscribepack
     FROM users WHERE id = ?`,
    [userId]
  );

  if (
    user.subscribe === 0 ||
    !user.subscribeenddate ||
    new Date(user.subscribeenddate) < new Date()
  ) {
    return {
      active: false,
      message: "Your subscription expired"
    };
  }

  return {
    active: true,
    plan: user.subscribepack,
    validTill: user.subscribeenddate
  };
};
