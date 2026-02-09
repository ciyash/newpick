// src/config/db.js
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const caPath = path.join(__dirname, "tidb-ca.pem");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 20,          // ✅ SAFE (10–30 is ideal)
  queueLimit: 0,                // unlimited queue
  enableKeepAlive: true,        // ✅ VERY IMPORTANT
  keepAliveInitialDelay: 0,

  ssl: {
    ca: fs.readFileSync(caPath),
    rejectUnauthorized: true
  }
});

export default pool;
