import bcrypt from "bcrypt";
import db from "../../config/db.js";
import redis from "../../config/redis.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import generateUserCode from "../../utils/usercode.js";


export const getUserProfileService = async (userId) => {
  const [users] = await db.query(
    `SELECT usercode, name, email, mobile, created_at 
     FROM users 
     WHERE usercode = ?`,
    [userId]
  );

  if (!users.length) {
    throw new Error("User not found");
  }

  return users[0];
};

