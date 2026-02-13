// controllers/series.controller.js

import  db  from "../../config/db.js";

export const getAllSeries = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        id,
        name,
        season,
        start_date,
        end_date,
        created_at,
        provider_series_id
      FROM series
      ORDER BY created_at DESC
    `);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


export const getSeriesById = async (req, res) => {
  try {
    const id = String(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Series id is required"
      });
    }

    const [rows] = await db.execute(
      `SELECT * FROM series WHERE CAST(id AS CHAR) = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




