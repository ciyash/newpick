import pool from "./db.js";

const test = async () => {
  try {
    const [rows] = await pool.query("SELECT 1");
    console.log("DB OK:", rows);
  } catch (err) {
    console.error("DB FAIL:", err);
  } finally {
    process.exit(0);
  }
};

test();
