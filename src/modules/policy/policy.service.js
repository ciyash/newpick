import db from  "../../config/db.js";

export const getPoliciesService = async (userId, screen = null) => {

  const baseQuery = `
    SELECT
      pc.id AS category_id,
      pc.slug,
      pc.display_name,
      pc.category_group,
      pc.description,
      pc.screen,
      pc.is_mandatory,
      pc.sort_order,

      pv.id AS policy_version_id,
      pv.version_number,
      pv.title,
      pv.summary,
      pv.content,
      pv.effective_date,

      CASE
        WHEN upa.id IS NOT NULL THEN true
        ELSE false
      END AS accepted,

      upa.accepted_at

    FROM policy_categories pc

    INNER JOIN policy_versions pv
      ON pv.category_id = pc.id
      AND pv.is_active = 1

    LEFT JOIN user_policy_acceptances upa
      ON upa.policy_version_id = pv.id
      AND upa.user_id = ?

    WHERE pc.is_active = 1
      AND upa.id IS NULL
      ${screen ? "AND pc.screen = ?" : ""}

    ORDER BY pc.sort_order ASC
  `;

  const params = screen ? [userId, screen] : [userId];
  const [rows] = await db.query(baseQuery, params);

  return rows;
};

export const acceptPoliciesService = async ({
  userId,
  policyVersionIds,
  ipAddress,
  userAgent,
  deviceInfo
}) => {

  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();

    const acceptedPolicies = [];

    for (const policyVersionId of policyVersionIds) {

      // check active policy version
      const [policyRows] = await connection.query(
        `
        SELECT
          pv.id,
          pv.category_id,
          pv.version_number,
          pv.title,
          pv.content

        FROM policy_versions pv

        WHERE pv.id = ?
          AND pv.is_active = 1

        LIMIT 1
        `,
        [policyVersionId]
      );

      if (!policyRows.length) {
        throw new Error(`Policy version ${policyVersionId} not found`);
      }

      const policy = policyRows[0];

      // already accepted check
      const [existing] = await connection.query(
        `
        SELECT id

        FROM user_policy_acceptances

        WHERE user_id = ?
          AND policy_version_id = ?

        LIMIT 1
        `,
        [userId, policyVersionId]
      );

      if (existing.length) {
        continue;
      }

      // insert acceptance
      await connection.query(
        `
        INSERT INTO user_policy_acceptances
        (
          user_id,
          policy_version_id,
          category_id,
          version_number,
          accepted_at,
          ip_address,
          device_info,
          user_agent,
          policy_snapshot
        )
        VALUES
        (?, ?, ?, ?, NOW(), ?, ?, ?, ?)
        `,
        [
          userId,
          policy.id,
          policy.category_id,
          policy.version_number,
          ipAddress,
          deviceInfo,
          userAgent,
          policy.content
        ]
      );

      acceptedPolicies.push({
        policy_version_id: policy.id,
        title: policy.title,
        version_number: policy.version_number
      });
    }

    await connection.commit();

    return acceptedPolicies;

  } catch (error) {

    await connection.rollback();
    throw error;

  } finally {

    connection.release();
  }
};

export const getPendingPoliciesService = async (userId) => {

  const [rows] = await db.query(
    `
    SELECT
      pc.id AS category_id,
      pc.slug,
      pc.display_name,
      pc.category_group,
      pc.description,
      pc.screen,
      pc.is_mandatory,
      pc.sort_order,

      pv.id AS policy_version_id,
      pv.version_number,
      pv.title,
      pv.summary,
      pv.content,
      pv.effective_date

    FROM policy_categories pc

    INNER JOIN policy_versions pv
      ON pv.category_id = pc.id
      AND pv.is_active = 1

    LEFT JOIN user_policy_acceptances upa
      ON upa.policy_version_id = pv.id
      AND upa.user_id = ?

    WHERE pc.is_active = 1
      AND upa.id IS NULL

    ORDER BY pc.sort_order ASC
    `,
    [userId]
  );

  return rows;
};