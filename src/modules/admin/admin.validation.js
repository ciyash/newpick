import Joi from "joi";

const validate = schema => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });
  if (error) {
    return res.status(422).json({
      success: false,
      errors: error.details.map(d => d.message)
    });
  }
  req.body = value;
  next();
};

/* ================= ADMIN ================= */

export const createAdmin = validate(Joi.object({
  name: Joi.string().min(3).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid("sub_admin","support").required()
}));

export const updateAdmin = validate(Joi.object({
  role: Joi.string().valid("sub_admin","support"),
  status: Joi.string().valid("active","inactive")
}));

/* ================= SERIES ================= */

export const createSeries = validate(Joi.object({
  name: Joi.string().required(),
  season: Joi.string().required(),
  start_date: Joi.date().required(),
  end_date: Joi.date().greater(Joi.ref("start_date")).required(),
  provider_series_id: Joi.string().optional()
}));

export const updateSeries = validate(Joi.object({
  name:       Joi.string(),
  season:     Joi.string(),
  start_date: Joi.date(),
  end_date:   Joi.date().greater(Joi.ref("start_date"))  
}).min(1)); 
/* ================= MATCH ================= */

// ── Shared status enums (single source of truth) ───────────────────────────
const MATCH_STATUSES   = ["UPCOMING", "LIVE", "COMPLETED", "ABANDONED", "INREVIEW"];
const CONTEST_STATUSES = ["UPCOMING", "LIVE", "FULL",      "COMPLETED", "CANCELLED"];

// ── Reusable: prize distribution item (single rank OR rank range) ──────────
const prizeDistributionItem = Joi.alternatives().try(

  // { rank: 1, amount: 3000, label: "1st Place" }
  Joi.object({
    rank:   Joi.number().integer().positive().required().messages({
      "number.positive": "rank must be a positive integer",
      "any.required":    "rank is required for a single-rank prize entry",
    }),
    amount: Joi.number().precision(2).positive().required().messages({
      "number.positive": "amount must be greater than 0",
      "any.required":    "amount is required",
    }),
    label:  Joi.string().trim().max(50).optional(),
  }),

  // { rank_from: 2, rank_to: 10, amount: 500, label: "Top 10" }
  Joi.object({
    rank_from: Joi.number().integer().positive().required().messages({
      "number.positive": "rank_from must be a positive integer",
      "any.required":    "rank_from is required for a range prize entry",
    }),
    rank_to: Joi.number().integer().positive()
      .greater(Joi.ref("rank_from")).required().messages({
        "number.greater": "rank_to must be greater than rank_from",
        "any.required":   "rank_to is required for a range prize entry",
      }),
    amount: Joi.number().precision(2).positive().required().messages({
      "number.positive": "amount must be greater than 0",
      "any.required":    "amount is required",
    }),
    label:  Joi.string().trim().max(50).optional(),
  })

);

// ── Helper: prize_distribution rules (reused in both validators) ───────────
function validatePrizeDistribution(dist, category_id, helpers) {
  if (!dist?.length) return null;

  // Must cover rank 1
  const coversRankOne = dist.some((p) =>
    p.rank === 1 ||
    (p.rank_from !== undefined && p.rank_from <= 1 && p.rank_to >= 1)
  );
  if (!coversRankOne) {
    return helpers.error("any.invalid", {
      message: `prize_distribution${category_id ? ` for category_id ${category_id}` : ""} must cover rank 1`,
    });
  }

  // No overlapping ranks
  const covered = new Set();
  for (const p of dist) {
    const from = p.rank !== undefined ? p.rank : p.rank_from;
    const to   = p.rank !== undefined ? p.rank : p.rank_to;
    for (let r = from; r <= to; r++) {
      if (covered.has(r)) {
        return helpers.error("any.invalid", {
          message: `prize_distribution${category_id ? ` for category_id ${category_id}` : ""} has overlapping rank ${r}`,
        });
      }
      covered.add(r);
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CREATE MATCH  (match + contests merged in one request)
// ═══════════════════════════════════════════════════════════════════════════
export const createMatch = validate(
  Joi.object({

    series_id: Joi.number().integer().positive().required().messages({
      "number.positive": "series_id must be a positive integer",
      "any.required":    "series_id is required",
    }),
    home_team_id: Joi.number().integer().positive().required().messages({
      "number.positive": "home_team_id must be a positive integer",
      "any.required":    "home_team_id is required",
    }),
    away_team_id: Joi.number().integer().positive().required().messages({
      "number.positive": "away_team_id must be a positive integer",
      "any.required":    "away_team_id is required",
    }),
    matchdate: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required()
      .messages({
        "string.pattern.base": "matchdate must be in YYYY-MM-DD format",
        "any.required":        "matchdate is required",
      }),
    start_time: Joi.string()
      .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
      .required()
      .messages({
        "string.pattern.base": "start_time must be in HH:MM or HH:MM:SS format",
        "any.required":        "start_time is required",
      }),

    contests: Joi.array()
      .items(
        Joi.object({
          category_id: Joi.number().integer().positive().required().messages({
            "number.positive": "category_id must be a positive integer",
            "any.required":    "Each contest must have a category_id",
          }),
          max_entries: Joi.number().integer().min(2).required().messages({
            "number.min":   "max_entries must be at least 2",
            "any.required": "max_entries is required",
          }),
          min_entries:             Joi.number().integer().min(0).optional(),
          is_guaranteed:           Joi.number().valid(0, 1).default(0),
          is_cashback:             Joi.number().valid(0, 1).optional(),
          contest_name:            Joi.string().trim().min(3).max(100).optional().messages({
            "string.min": "contest_name must be at least 3 characters",
            "string.max": "contest_name cannot exceed 100 characters",
          }),
          winner_percentage:       Joi.number().min(0).max(100).optional(),
          platform_fee_percentage: Joi.number().min(0).max(100).optional(),
          status: Joi.string().valid(...CONTEST_STATUSES).default("UPCOMING").messages({
            "any.only": `Contest status must be one of: ${CONTEST_STATUSES.join(", ")}`,
          }),
          prize_distribution: Joi.array()
            .items(prizeDistributionItem)
            .min(1)
            .optional()
            .messages({
              "array.min": "prize_distribution must have at least one entry if provided",
            }),
        })
      )
      .min(1)
      .required()
      .messages({
        "array.min":    "At least one contest category must be selected",
        "any.required": "contests is required",
      }),

  })
  .custom((value, helpers) => {

    // 1. Match must be in the future
    const matchDateTime = new Date(`${value.matchdate}T${value.start_time}`);
    if (isNaN(matchDateTime.getTime())) {
      return helpers.error("any.invalid", {
        message: "matchdate and start_time combination is not a valid datetime",
      });
    }
    if (matchDateTime <= new Date()) {
      return helpers.error("any.invalid", {
        message: "Match must be scheduled in the future",
      });
    }

    // 2. Home and away teams must differ
    if (Number(value.home_team_id) === Number(value.away_team_id)) {
      return helpers.error("any.invalid", {
        message: "Home and away teams must be different",
      });
    }

    // 3. No duplicate category_ids across contests
    const categoryIds = value.contests.map((c) => Number(c.category_id));
    if (new Set(categoryIds).size !== categoryIds.length) {
      return helpers.error("any.invalid", {
        message: "Duplicate category_id entries found in contests",
      });
    }

    // 4. Per-contest prize_distribution checks
    for (const contest of value.contests) {
      const err = validatePrizeDistribution(
        contest.prize_distribution,
        contest.category_id,
        helpers
      );
      if (err) return err;
    }

    return value;
  })
  .messages({ "any.invalid": "{{#message}}" })
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. CREATE CONTEST  (standalone — add contest to an existing match)
// ═══════════════════════════════════════════════════════════════════════════
export const createContestold = validate(
  Joi.object({

    match_id: Joi.number().integer().positive().required().messages({
      "number.positive": "match_id must be a positive integer",
      "any.required":    "match_id is required",
    }),
    contest_type: Joi.string().trim().max(20).required().messages({
      "string.max":   "contest_type cannot exceed 20 characters",
      "any.required": "contest_type is required",
    }),
    contest_name: Joi.string().trim().min(3).max(100).optional().messages({
      "string.min": "contest_name must be at least 3 characters",
      "string.max": "contest_name cannot exceed 100 characters",
    }),

    entry_fee: Joi.number().precision(2).positive().required().messages({
      "number.positive": "entry_fee must be greater than 0",
      "any.required":    "entry_fee is required",
    }),
    max_entries: Joi.number().integer().min(2).required().messages({
      "number.min":   "max_entries must be at least 2",
      "any.required": "max_entries is required",
    }),
    min_entries: Joi.number().integer().min(0).default(2),

    platform_fee_percentage: Joi.number().min(0).max(100).default(0).messages({
      "number.min": "platform_fee_percentage cannot be negative",
      "number.max": "platform_fee_percentage cannot exceed 100",
    }),
    winner_percentage: Joi.number().min(0).max(100).default(0).messages({
      "number.min": "winner_percentage cannot be negative",
      "number.max": "winner_percentage cannot exceed 100",
    }),

    first_prize:   Joi.number().precision(2).min(0).default(0),
    is_guaranteed: Joi.number().valid(0, 1).default(0),
    is_cashback:   Joi.number().valid(0, 1).default(0),

    // ✅ CONTEST status enum (not match status)
    status: Joi.string().valid(...CONTEST_STATUSES).default("UPCOMING").messages({
      "any.only": `Contest status must be one of: ${CONTEST_STATUSES.join(", ")}`,
    }),

    // ✅ Updated: supports single rank AND rank range
    prize_distribution: Joi.array()
      .items(prizeDistributionItem)
      .min(1)
      .optional()
      .messages({
        "array.min": "prize_distribution must have at least one entry if provided",
      }),

  })
  .custom((value, helpers) => {

    const err = validatePrizeDistribution(value.prize_distribution, null, helpers);
    if (err) return err;

    return value;
  })
  .messages({ "any.invalid": "{{#message}}" })
);






export const createMatchol = validate(
  Joi.object({
    series_id: Joi.number().integer().positive().required(),

    home_team_id: Joi.number().integer().positive().required(),

    away_team_id: Joi.number().integer().positive().required(),

    // DATE column
    matchdate: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required(),

    // TIME column (NOT Joi.date())
    start_time: Joi.string()
      .pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/)
      .required()
  }).custom((value, helpers) => {
    const matchDateTime = new Date(
      `${value.matchdate}T${value.start_time}`
    );

    if (matchDateTime <= new Date()) {
      return helpers.message("Match must be scheduled in the future");
    }

    return value;
  })
);
export const createMatchb = validate(
  Joi.object({
    series_id:    Joi.number().integer().positive().required(),
    home_team_id: Joi.number().integer().positive().required(),
    away_team_id: Joi.number().integer().positive().required(),
    matchdate:    Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    start_time:   Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).required(),

    // ✅ Add contests array
    contests: Joi.array().items(
      Joi.object({
        category_id:   Joi.number().integer().positive().required(),
        max_entries:   Joi.number().integer().min(2).required(),
        is_guaranteed: Joi.number().valid(0, 1).default(0),
      })
    ).min(1).required().messages({
      "array.min":  "At least one contest category must be selected",
      "any.required": "contests is required",
    }),

  }).custom((value, helpers) => {
    const matchDateTime = new Date(`${value.matchdate}T${value.start_time}`);
    if (matchDateTime <= new Date()) {
      return helpers.message("Match must be scheduled in the future");
    }
    return value;
  })
);

export const updateMatch = validate(Joi.object({
  start_time:   Joi.date(),
  status:       Joi.string().valid("UPCOMING", "LIVE", "INREVIEW", "COMPLETED", "ABANDONED"),
  series_id:    Joi.number().integer().positive(),
  home_team_id: Joi.number().integer().positive(),
  away_team_id: Joi.number().integer().positive(),
}).min(1)); 

/* ================= TEAM ================= */

export const createTeam = validate(Joi.object({
  name:       Joi.string().required(),
  short_name: Joi.string().max(10).required()
}));


export const updateTeam = validate(Joi.object({
  name:       Joi.string(),
  short_name: Joi.string().max(10)
}).min(1)); 


/* ================= PLAYERS ================= */ 

export const createPlayer = validate(Joi.object({
  team_id:       Joi.number().integer().positive().required(),
  name:          Joi.string().required(),
  position:      Joi.string().valid("GK", "DEF", "MID", "FWD").required(),
  points:        Joi.number().min(0).default(0),      
  playercredits: Joi.number().min(0).default(0)       
}));

export const updatePlayer = validate(Joi.object({
  name:          Joi.string(),
  position:      Joi.string().valid("GK", "DEF", "MID", "FWD"),
  points:        Joi.number().min(0),
  playercredits: Joi.number().min(0),
  team_id:       Joi.number().integer().positive()
}).min(1)); 


/* ================= CONTEST ================= */

export const createContest = validate(
  Joi.object({
    match_id:          Joi.alternatives()
                         .try(
                           Joi.string().trim().pattern(/^\d+$/),
                           Joi.number().integer().positive()
                         )
                         .required(),
    contest_type:      Joi.string().max(20).required(),
    max_entries:       Joi.number().integer().min(2).required(),
    is_guaranteed:     Joi.number().valid(0, 1).default(0),
    rank1Percentage:   Joi.number().min(1).max(10).precision(2).default(8),
    top1_end_rank:     Joi.number().integer().positive().optional(),
    linear_start_rank: Joi.number().integer().positive().optional(),
    linear_end_rank:   Joi.number().integer().positive().optional(),
    status:            Joi.string()
                         .valid("UPCOMING", "LIVE", "FULL", "COMPLETED", "CANCELLED")
                         .default("UPCOMING"),
    prize_distribution: Joi.alternatives().try(
                          Joi.object(),
                          Joi.array()
                        ).optional(),
  })
);

export const createContestoldb = validate(Joi.object({
  match_id:                Joi.number().integer().positive().required(),
  contest_type:            Joi.string().max(20).required(),       

  entry_fee:               Joi.number().precision(2).positive().required(),
  max_entries:             Joi.number().integer().positive().required(),
  min_entries:             Joi.number().integer().min(0).default(0),

  platform_fee_percentage: Joi.number().min(0).max(100).default(0),
  winner_percentage:       Joi.number().min(0).max(100).default(0),

  first_prize:             Joi.number().precision(2).min(0).default(0),
  is_guaranteed:           Joi.number().valid(0, 1).default(0),
  is_cashback:             Joi.number().valid(0, 1).default(0),

  prize_distribution: Joi.array().items(
    Joi.object({
      rank:   Joi.number().integer().positive().required(),
      amount: Joi.number().positive().required()
    })
  ).optional(),

  status: Joi.string()
    .valid("UPCOMING", "LIVE", "FULL", "COMPLETED", "CANCELLED")
    .default("UPCOMING"),

}));

export const updateContest = validate(
  Joi.object({
    entry_fee:               Joi.number().precision(2).positive(),
    max_entries:             Joi.number().integer().positive(),
    min_entries:             Joi.number().integer().min(0),
    contest_type:            Joi.string().max(20),
    is_guaranteed:           Joi.number().valid(0, 1),
    is_cashback:             Joi.number().valid(0, 1),
    winner_percentage:       Joi.number().min(0).max(100),
    first_prize:             Joi.number().precision(2).min(0),
    platform_fee_percentage: Joi.number().min(0).max(100),
    status: Joi.string().valid("UPCOMING", "LIVE", "FULL", "COMPLETED", "CANCELLED"),
    prize_distribution: Joi.array().items(
      Joi.alternatives().try(
        Joi.object({
          rank:   Joi.number().integer().positive().required(),
          amount: Joi.number().positive().required()
        }),
        Joi.object({
          rank_from: Joi.number().integer().positive().required(),
          rank_to:   Joi.number().integer().positive()
                       .greater(Joi.ref("rank_from")).required(),
          amount:    Joi.number().positive().required()
        })

      )
    ).optional()

  }).min(1)
);


/* ================= CONTEST CATEGORY ================= */

export const createContestCategory = validate(
  Joi.object({
    name:        Joi.string().trim().min(2).max(100).required(),
    percentage:  Joi.number().min(0).max(100).precision(2).default(0),
    entryfee:    Joi.number().min(0).precision(2).default(0),
    platformfee: Joi.number().min(0).precision(2).default(0),
  })
);

export const updateContestCategory = validate(
  Joi.object({
    name:        Joi.string().trim().min(2).max(100),
    percentage:  Joi.number().min(0).max(100).precision(2),
    entryfee:    Joi.number().min(0).precision(2),
    platformfee: Joi.number().min(0).precision(2),
  }).min(1) // ✅ at least one field required
);

//Withdraw

// ── User: request a withdrawal ───────────────────────────────────────────────
export const requestWithdraw = validate(
  Joi.object({
    amount: Joi.number().positive().precision(2).required().messages({
      "any.required": "Amount is required",
      "number.positive": "Amount must be greater than 0",
      "number.base":     "Amount must be a number",
    }),
  })
);

// ── Admin: approve a withdrawal ──────────────────────────────────────────────
export const approveWithdraw = validate(
  Joi.object({
    transaction_id: Joi.string().max(255).required().messages({
      "any.required": "Stripe transaction ID is required",
      "string.empty": "Stripe transaction ID cannot be empty",
    }),
    remarks: Joi.string().max(500).optional().allow("", null),
  })
);

// ── Admin: reject a withdrawal ───────────────────────────────────────────────
export const rejectWithdraw = validate(
  Joi.object({
    remarks: Joi.string().max(500).required().messages({
      "any.required": "Remarks are required for rejection",
      "string.empty": "Remarks cannot be empty",
    }),
  })
);




