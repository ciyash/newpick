// controllers/series.controller.js

import  db  from "../../config/db.js";



export const getAllSeries = async (req, res) => {
  try {
    // 1️⃣ Get all series
    const [seriesRows] = await db.execute(`
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

    // 2️⃣ For each series → get matches WITH TEAM NAMES
    const result = await Promise.all(
      seriesRows.map(async (series) => {
        const [matches] = await db.execute(
          `
          SELECT 
            m.id,
            m.series_id,
            m.start_time,
            m.status,

            ht.name AS home_team_name,
            at.name AS away_team_name

          FROM matches m
          JOIN teams ht ON m.home_team_id = ht.id
          JOIN teams at ON m.away_team_id = at.id

          WHERE m.series_id = ?
          ORDER BY m.start_time ASC
          `,
          [series.seriesid]
        );

        return {
          ...series,
          matches
        };
      })
    );

    res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error("GetAllSeries Error:", error.message);

    res.status(500).json({
      success: false,
      message: error.message
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


export const getMatchesBySeriesId = async (req, res) => {
  try {
    const { seriesid } = req.params;

    if (!seriesid) {
      return res.status(400).json({
        success: false,
        message: "Series id is required"
      });
    }

    const [rows] = await db.execute(
      `SELECT * FROM matches WHERE series_id = ? ORDER BY start_time ASC`,
      [seriesid]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.error("GetMatchesBySeriesId Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};






//kjfbgnkjdngnkdfsnk