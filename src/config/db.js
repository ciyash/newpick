// src/config/db.js
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

// Proper __dirname for Windows + ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CA file must be in the SAME folder as db.js
const caPath = path.join(__dirname, "tidb-ca.pem");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10000 ,

  ssl: {
    ca: fs.readFileSync(caPath),
    rejectUnauthorized: true
  }
});

console.log("Connected DB:", process.env.DB_NAME);
export default pool;
