// validations/policy.validation.js

import Joi from "joi";

export const acceptPoliciesSchema = Joi.object({
  policyVersionIds: Joi.array()
    .items(
      Joi.number()
        .integer()
        .positive()
        .required()
    )
    .min(1)
    .required()
    .messages({
      "array.base": "policyVersionIds must be an array",
      "array.min": "At least one policyVersionId is required",
      "any.required": "policyVersionIds is required"
    })
});