import Joi from "joi";

export const createAdminSchema = Joi.object({
  name: Joi.string().min(3).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid("sub_admin", "support").required()
});

export const updateAdminSchema = Joi.object({
  role: Joi.string().valid("sub_admin", "support").optional(),
  status: Joi.string().valid("active", "inactive").optional()
});

export const updateProfileSchema = Joi.object({
  name: Joi.string().min(3).optional(),
  password: Joi.string().min(8).optional(),
  profile_image: Joi.string().uri().optional()
});
