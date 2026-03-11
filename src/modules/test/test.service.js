import axios from "axios";

export const getAllPlayersService = async () => {
  try {
  
    const response = await axios.get(
      "https://api.sportmonks.com/v3/football/players",
      {
        params: {
          api_token: process.env.SPORTMONKS_API_TOKEN
        }
      }
    );

    return response.data;  

  } catch (err) {

    console.error("Sportmonks API Error:", err.response?.data || err.message);
    throw new Error("Failed to fetch players");

  }
};