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

/* ADMIN */
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

/* SERIES */
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

/* MATCH */
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

/* TEAM */
export const createTeam = validate(Joi.object({
  name: Joi.string().required(),
  short_name: Joi.string().max(10).required()
}));

export const updateTeam = validate(Joi.object({
  name: Joi.string(),
  short_name: Joi.string()
}));

/* PLAYER */
export const createPlayer = validate(Joi.object({
  team_id: Joi.number().required(),
  name: Joi.string().required(),
  position: Joi.string().valid("GK","DEF","MID","FWD").required()
}));

export const updatePlayer = validate(Joi.object({
  name: Joi.string(),
  position: Joi.string().valid("GK","DEF","MID","FWD")
}));
