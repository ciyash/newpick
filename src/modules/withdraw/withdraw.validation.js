import Joi from "joi";
import { validate } from "../../middlewares/validate.js";

export const requestWithdrawValidate = validate(
  Joi.object({
    amount: Joi.number()
      .positive()
      .min(10)
      .max(2000)
      .precision(2)
      .required()
      .messages({
        "number.min": "Minimum withdrawal amount is £10",
        "number.max": "Maximum withdrawal amount is £2000",
        "number.positive": "Amount must be positive",
        "any.required": "Amount is required",
      }),
  })
);