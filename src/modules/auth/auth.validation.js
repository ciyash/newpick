
import Joi from "joi";

export const signupSchema = Joi.object({
  name: Joi.string().min(3).max(100).required(),
  email: Joi.string().email().required(),
  mobile: Joi.string().pattern(/^[0-9]{10,15}$/).required(),
  region: Joi.string().required(),
  address: Joi.string().allow("", null),
  dob: Joi.date().less("now").required(),
  referalid: Joi.string().allow("", null),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[A-Z])(?=.*\d).+$/)
    .required(),
}).options({ allowUnknown: true });



  export const sendOtpSchema = Joi.object({
  email: Joi.string().email().optional(),
  mobile: Joi.string().pattern(/^[0-9]{10}$/).optional(),
})
  .or("email", "mobile")
  .required();

  export const loginSchema = Joi.object({
  email: Joi.string().email().optional(),
  mobile: Joi.string().pattern(/^[0-9]{10}$/).optional(),
  otp: Joi.string().length(6).required(),
})
  .or("email", "mobile")
  .required();

