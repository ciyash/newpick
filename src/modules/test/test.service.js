import redis from "../../config/redis.js";

export const sendMobileOtpService = async (mobile) => {

 const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

 const otp = Math.floor(100000 + Math.random() * 900000);

 await redis.set(
  `MOBILE_OTP:${normalizedMobile}`,
  otp,
  { ex: 300 }
 );

 console.log(`OTP for ${normalizedMobile}: ${otp}`);

 return true;
};





export const verifyMobileOtpService = async (mobile, otp) => {

 const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

 const savedOtp = await redis.get(`MOBILE_OTP:${normalizedMobile}`);

 if (!savedOtp) {
  throw new Error("OTP expired");
 }

 if (String(savedOtp) !== String(otp)) {
  throw new Error("Invalid OTP");
 }

 await redis.del(`MOBILE_OTP:${normalizedMobile}`);

 return true;
};



