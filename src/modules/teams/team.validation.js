import Joi from "joi";

export const createTeamSchema = Joi.object({

  userId: Joi.number().integer().positive().required(),

  matchId: Joi.number().integer().positive().required(),

  players: Joi.array()
    .items(Joi.number().integer().positive().required())
    .length(11)
    .unique((a, b) => a === b)
    .required()
    .messages({
      "array.unique": "Duplicate players are not allowed. Player ID {{#dupeValue}} appears more than once",
      "array.length": "Team must have exactly 11 players",
    }),

  captainId: Joi.number().integer().positive().required(),

  viceCaptainId: Joi.number()
    .integer()
    .positive()
    .invalid(Joi.ref("captainId"))
    .required()
    .messages({
      "any.invalid": "Vice Captain must be different from Captain",
    }),

})
  .options({ stripUnknown: true })
  .custom((value, helpers) => {

    const { players, captainId, viceCaptainId } = value;

    if (!players.includes(captainId)) {
      return helpers.error("any.only", {
        valids: [],
        label: "captainId",
        message: "Captain must be one of the selected players",
      });
    }

    if (!players.includes(viceCaptainId)) {
      return helpers.error("any.only", {
        valids: [],
        label: "viceCaptainId",
        message: "Vice Captain must be one of the selected players",
      });
    }

    return value;

  })
  .messages({
    "any.only": "{{#message}}",
  });

export const updateTeamSchema = Joi.object({

  teamId: Joi.number().integer().positive().required(),

  players: Joi.array()
    .items(Joi.number().integer().positive().required())
    .length(11)
    .unique()
    .optional(),

  captainId: Joi.number().integer().positive().optional(),

  viceCaptainId: Joi.number()
    .integer()
    .positive()
    .invalid(Joi.ref("captainId"))
    .optional()
    .messages({
      "any.invalid": "Vice Captain must be different from Captain",
    }),

})
  .options({ stripUnknown: true })
  .or("players", "captainId", "viceCaptainId")
  .custom((value, helpers) => {

    const { players, captainId, viceCaptainId } = value;

    if (players && captainId && !players.includes(captainId)) {
      return helpers.error("any.only", {
        valids: [],
        label: "captainId",
        message: "Captain must be one of the selected players",
      });
    }

    if (players && viceCaptainId && !players.includes(viceCaptainId)) {
      return helpers.error("any.only", {
        valids: [],
        label: "viceCaptainId",
        message: "Vice Captain must be one of the selected players",
      });
    }

    return value;

  })
  .messages({
    "any.only": "{{#message}}",
  });