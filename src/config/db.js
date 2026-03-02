import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const caPath = path.join(__dirname, "tidb-ca.pem");

if (!fs.existsSync(caPath)) {
  console.error(`SSL certificate not found at: ${caPath}`);  
  process.exit(1);                                            
}


const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
  connectTimeout:     30000,                                  

  ssl: {
    ca:                 fs.readFileSync(caPath),
    rejectUnauthorized: true,
  },
});



const verifyConnection = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();                                  
    console.log(" Database connected successfully");
    connection.release();
  } catch (err) {
    console.error(" Database connection failed:", err.message);
    process.exit(1);                                         
  }
};

verifyConnection();

pool.on("connection", (connection) => {                       
  connection.on("error", (err) => {
    if (err.code === "ECONNRESET" || err.code === "PROTOCOL_CONNECTION_LOST") {
      console.warn("MySQL connection lost, pool will reconnect automatically");
    } else {
      console.error(" Unexpected MySQL connection error:", err);
    }
  });
});

export default pool;