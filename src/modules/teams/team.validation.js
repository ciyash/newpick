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
    .unique((a, b) => a === b)
    .optional()
    .messages({
      "array.unique": "Duplicate players are not allowed. Player ID {{#dupeValue}} appears more than once",
      "array.length": "Team must have exactly 11 players",
    }),

  captainId: Joi.number().integer().positive().optional(),

  // ❌ Joi.ref() here won't work reliably when captainId is optional
  // ✅ Handle same-check in custom() below instead
  viceCaptainId: Joi.number()
    .integer()
    .positive()
    .optional(),

  teamName: Joi.string().trim().min(1).max(50).optional(),

})
  .options({ stripUnknown: true })

  // At least one field must be present
  .or("players", "captainId", "viceCaptainId", "teamName")

  .custom((value, helpers) => {
    const { players, captainId, viceCaptainId } = value;

    // ✅ Rule 1: captainId & viceCaptainId must come together
    if (captainId && !viceCaptainId) {
      return helpers.error("any.invalid", {
        message: "viceCaptainId is required when captainId is provided",
      });
    }
    if (viceCaptainId && !captainId) {
      return helpers.error("any.invalid", {
        message: "captainId is required when viceCaptainId is provided",
      });
    }

    // ✅ Rule 2: Captain and VC cannot be same
    if (captainId && viceCaptainId && captainId === viceCaptainId) {
      return helpers.error("any.invalid", {
        message: "Vice Captain must be different from Captain",
      });
    }

    // ✅ Rule 3: If players + captainId, captain must be in players
    if (players && captainId && !players.includes(captainId)) {
      return helpers.error("any.invalid", {
        message: "Captain must be one of the selected players",
      });
    }

    // ✅ Rule 4: If players + viceCaptainId, VC must be in players
    if (players && viceCaptainId && !players.includes(viceCaptainId)) {
      return helpers.error("any.invalid", {
        message: "Vice Captain must be one of the selected players",
      });
    }

    return value;
  })
  .messages({
    "any.invalid": "{{#message}}",
  });