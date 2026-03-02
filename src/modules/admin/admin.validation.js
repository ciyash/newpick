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

export const createMatch = validate(Joi.object({
  series_id:    Joi.number().integer().positive().required(),
  home_team_id: Joi.number().integer().positive().required(),
  away_team_id: Joi.number().integer().positive().required(),
  start_time:   Joi.date().greater("now").required() 
}));


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
    match_id:                Joi.number().integer().positive().required(),
    contest_type:            Joi.string().max(20).required(),  
    entry_fee:               Joi.number().precision(2).positive().required(),
    platform_fee_percentage: Joi.number().min(0).max(100).required(),
    status:                  Joi.string()
                               .valid("UPCOMING", "LIVE", "FULL", "COMPLETED", "CANCELLED")
                               .default("UPCOMING"),
  })
);

export const createContestold = validate(Joi.object({
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