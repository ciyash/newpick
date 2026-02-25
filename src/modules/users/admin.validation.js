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
  name: Joi.string(),
  season: Joi.string(),
  start_date: Joi.date(),
  end_date: Joi.date()
}));

/* ================= MATCH ================= */

export const createMatch = validate(Joi.object({
  series_id: Joi.number().required(),
  home_team_id: Joi.number().required(),
  away_team_id: Joi.number().required(),
  start_time: Joi.date().required()
}));

export const updateMatch = validate(Joi.object({
  start_time: Joi.date(),
  status: Joi.string().valid("scheduled","live","completed")
}));

/* ================= TEAM ================= */

export const createTeam = validate(Joi.object({
  name: Joi.string().required(),
  short_name: Joi.string().max(10).required()
}));

export const updateTeam = validate(Joi.object({
  name: Joi.string(),
  short_name: Joi.string()
}));


/* ================= PLAYERS ================= */ 

export const createPlayer = validate(Joi.object({
  team_id: Joi.number().required(),
  name: Joi.string().required(),
  position: Joi.string().valid("GK","DEF","MID","FWD").required()
}));

export const updatePlayer = validate(Joi.object({
  name: Joi.string(),
  position: Joi.string().valid("GK","DEF","MID","FWD")
}));

/* ================= CONTEST ================= */

export const createContest = validate(Joi.object({
  match_id: Joi.number().required(),

  entry_fee: Joi.number().precision(2).positive().required(),
  prize_pool: Joi.number().precision(2).positive().required(),

  max_entries: Joi.number().integer().positive().required(),
  min_entries: Joi.number().integer().min(0).default(0),

       contest_type: Joi.string().max(20).required(),
  winner_percentage: Joi.number().min(0).max(100).default(0),
  total_winners: Joi.number().integer().min(0).default(0),

  first_prize: Joi.number().precision(2).min(0).default(0),

  prize_distribution: Joi.string().allow(null, ""),

  cashback_percentage: Joi.number().min(0).max(100).default(0),
  cashback_amount: Joi.number().precision(2).min(0).default(0),

  platform_fee_percentage: Joi.number().min(0).max(100).default(0),
  platform_fee_amount: Joi.number().precision(2).min(0).default(0),

  status: Joi.string()
    .valid("UPCOMING", "LIVE", "FULL", "COMPLETED", "CANCELLED")
    .default("UPCOMING")
}));

export const updateContest = validate(Joi.object({
  entry_fee: Joi.number().precision(2).positive(),
  prize_pool: Joi.number().precision(2).positive(),

  max_entries: Joi.number().integer().positive(),
  min_entries: Joi.number().integer().min(0),
  current_entries: Joi.number().integer().min(0),

  contest_type: Joi.string().valid("NORMAL", "GUARANTEED", "CASHBACK"),
  is_guaranteed: Joi.number().valid(0, 1),

  winner_percentage: Joi.number().min(0).max(100),
  total_winners: Joi.number().integer().min(0),

  first_prize: Joi.number().precision(2).min(0),
  prize_distribution: Joi.string().allow(null, ""),

  is_cashback: Joi.number().valid(0, 1),
  cashback_percentage: Joi.number().min(0).max(100),
  cashback_amount: Joi.number().precision(2).min(0),

  platform_fee_percentage: Joi.number().min(0).max(100),
  platform_fee_amount: Joi.number().precision(2).min(0),

  status: Joi.string().valid(
    "UPCOMING",
    "LIVE",
    "FULL",
    "COMPLETED",
    "CANCELLED"
  )
}).min(1));



/* ================= CONTEST CATEGORY ================= */

export const createContestCategory = validate(
  Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),

    percentage: Joi.number()
      .min(0)
      .max(100)
      .precision(2)
      .required(),

    entryfee: Joi.number()
      .positive()
      .precision(2)
      .required(),

      platformfee: Joi.number()
      .positive()
      .precision(2)
      .required()
  })
);