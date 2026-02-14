// controllers/series.controller.js

import  db  from "../../config/db.js";

export const getAllSeries = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        id,    
        seriesid,
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
    const { id } = req.params;

    // Validate id presence
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Series id is required"
      });
    }

    // Convert to number
    const seriesid = Number(id);

    // Validate numeric id
    if (Number.isNaN(seriesid)) {
      return res.status(400).json({
        success: false,
        message: "Series id must be a number"
      });
    }

    // Query DB
    const [rows] = await db.execute(
      "SELECT * FROM series WHERE seriesid = ? LIMIT 1",
      [seriesid]
    );

    // Not found
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    // Success
    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error("GetSeriesById Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};






