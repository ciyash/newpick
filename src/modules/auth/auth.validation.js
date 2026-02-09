import Joi from "joi";

export const signupSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
  region: Joi.string().required(),
  address: Joi.string().allow("", null),
  dob: Joi.date().less("now").required(),
   category: Joi.string().valid("students", "others").required(),

  // accept WRONG key
  referalid: Joi.string().empty("").default("AAAAA1111").optional(),

  // accept CORRECT key
  referralid: Joi.string().empty("").default("AAAAA1111").optional(),

});


export const verifyOtpSchema = Joi.object({
  mobile: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .required(),

  otp: Joi.alternatives()
  .try(
    Joi.string().length(6),
    Joi.number().integer().min(100000).max(999999)
  )
  .required()
});


export const sendOtpSchema = Joi.object({
  email: Joi.string().email().optional(),

  mobile: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .optional(),
})
  .or("email", "mobile")
  .required();  


export const loginSchema = Joi.object({
  email: Joi.string().email().optional(),

  mobile: Joi.string()
    .pattern(/^[0-9]{10,15}$/)
    .optional(),

  otp: Joi.string()
    .length(6)
    .required(),
})
  .or("email", "mobile")
  .required();
