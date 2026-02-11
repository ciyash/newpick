import Joi from "joi";

export const feedbackSchema = Joi.object({
  subject: Joi.string().min(3).max(255).required(),
  message: Joi.string().min(5).required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  description: Joi.string().allow("", null).optional()
});
