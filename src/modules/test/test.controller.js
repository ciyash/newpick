import {
 sendMobileOtpService,
 verifyMobileOtpService
} from './test.service.js';


export const sendOtpController = async (req, res) => {

 try {

  const { mobile } = req.body;

  await sendMobileOtpService(mobile);

  res.json({
   success: true,
   message: "OTP sent successfully"
  });

 } catch (error) {

  res.status(400).json({
   success: false,
   message: error.message
  });

 }

};


export const verifyOtpController = async (req, res) => {

 try {

  const { mobile, otp } = req.body;

  await verifyMobileOtpService(mobile, otp);

  res.json({
   success: true,
   message: "Mobile verified"
  });

 } catch (error) {

  res.status(400).json({
   success: false,
   message: error.message
  });

 }

};