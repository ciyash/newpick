const db = require("../../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateUserCode } = require("../../utils/usercode");

exports.signupService = async (data) => {
  const { name, email, mobile, region, address, dob, referralid, password } = data;

  const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (existing.length) throw new Error("Email already registered");

  const hashedPassword = await bcrypt.hash(password, 10);
  
  let usercode;
let isUnique = false;

while (!isUnique) {
  usercode = generateUserCode();

  const [existing] = await db.query(
    "SELECT userid FROM users WHERE userid = ?",
    [usercode]
  );

  if (existing.length === 0) {
    isUnique = true;
  }
}


  const [result] = await db.query(
  "INSERT INTO users (name, email, mobile, region, address, dob, referalid, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
  [name, email, mobile, region, address, dob, referralid || "PK123456", hashedPassword]
);

  return { id: result.insertId, name, email, mobile };
};

exports.loginService = async (data) => {
  const { email, password } = data;

  const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (!rows.length) throw new Error("Invalid email or password");

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error("Invalid email or password");

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  return { token, user: { id: user.id, name: user.name, email: user.email } };
};
