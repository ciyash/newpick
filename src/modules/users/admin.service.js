import bcrypt from "bcrypt";
import db from "../../config/db.js";
import redis from "../../config/redis.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import generateUserCode from "../../utils/usercode.js";

export const createAdminService = async (creator, data) => {
  
  if (!data.name || !data.email || !data.password || !data.role) {
    throw new Error("Missing required admin fields");
  }

  
  const [existing] = await db.query(
    "SELECT id FROM admin WHERE email = ?",
    [data.email]
  );

  if (existing.length > 0) {
    throw new Error("Admin with this email already exists");
  }

  
  const hashed = await bcrypt.hash(data.password, 12);

  console.log("Preparing admin insert with values:", {
    name: data.name,
    email: data.email,
    password_hash: hashed,
    role: data.role
  });

  let result; 
  try {
    [result] = await db.query(
      `INSERT INTO admin (name,email,password_hash,role,created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [data.name, data.email, hashed, data.role]
    );
    console.log("Insert successful, new admin id:", result.insertId);
  } catch (err) {
    console.error("Admin insert failed:", err);
    throw err;
  }

  
  await db.query(
    `INSERT INTO admin_logs (admin_id, action)
     VALUES (?, 'CREATE_ADMIN')`,
    [result.insertId]
  );


  return { id: result.insertId };
};

export const getAdminsService = async () => {
  const [rows] = await db.query(
    `SELECT id,name,email,role,status,created_at FROM admin`
  );
  return rows;
};

export const getAdminByIdService = async (id) => {
  const [[admin]] = await db.query(
    `SELECT id,name,email,role,status FROM admin WHERE id = ?`,
    [id]
  );
  if (!admin) throw new Error("Admin not found");
  return admin;
};

export const updateAdminService = async (actor, id, data) => {
  await db.query(`UPDATE admin SET ? WHERE id = ?`, [data, id]);

  await db.query(
    `INSERT INTO admin_logs (admin_id, action)
     VALUES (?, 'UPDATE_ADMIN')`,
    [actor.adminId]
  );
};

export const updateProfileService = async (admin, data) => {
  if (data.password) {
    data.password = await bcrypt.hash(data.password, 12);
  }

  await db.query(`UPDATE admin SET ? WHERE id = ?`, [
    data,
    admin.adminId
  ]);
};
