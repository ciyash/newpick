import Joi from "joi";

export const generateUCTSchema = Joi.object({

  matchId: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      "any.required": "matchId is required",
      "number.base": "matchId must be a number"
    }),

  // Optional fields (future ready)

  mode: Joi.string()
    .valid("CVC", "C_VC")
    .optional(),

  mandateYes: Joi.array()
    .items(Joi.number().integer().positive())
    .max(11)
    .optional(),

  mandateNo: Joi.array()
    .items(Joi.number().integer().positive())
    .optional(),

  captainPool: Joi.array()
    .items(Joi.number().integer().positive())
    .optional(),

  viceCaptainPool: Joi.array()
    .items(Joi.number().integer().positive())
    .optional()

}).custom((value, helpers) => {

  // ❌ Prevent YES & NO overlap
  if (value.mandateYes && value.mandateNo) {
    const overlap = value.mandateYes.some(id =>
      value.mandateNo.includes(id)
    );
    if (overlap) {
      return helpers.error("any.invalid");
    }
  }

  return value;

}, "Mandate validation")
.messages({
  "any.invalid": "Mandate YES and NO cannot contain same player"
});