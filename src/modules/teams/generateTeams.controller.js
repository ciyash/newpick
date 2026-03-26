import { generateTeamsService } from "./generateTeams.service.js";

export const generateTeams = async (req,res)=>{

  try{

    if(!req.user?.id){
      return res.status(401).json({
        success:false,
        message:"User not authenticated"
      });
    }

    const userId = req.user.id;

    const { matchId,team_a,team_b } = req.body;

    if(!matchId){
      return res.status(400).json({
        success:false,
        message:"matchId is required"
      });
    }

    if(!Array.isArray(team_a) || !team_a.length){
      return res.status(400).json({
        success:false,
        message:"team_a required"
      });
    }

    if(!Array.isArray(team_b) || !team_b.length){
      return res.status(400).json({
        success:false,
        message:"team_b required"
      });
    }

    const result = await generateTeamsService(
      userId,
      Number(matchId),
      team_a,
      team_b
    );

    res.status(201).json(result);

  }catch(error){

    const knownErrors = [
  "Match not found",
  "Team generation is closed for this match",
  "Teams already generated for this match",
  "No players provided",
  "Players do not belong to this match",
  "Maximum 20 teams allowed per match",
  "Binary generated no teams",
  "All generated teams were duplicates",
  "Binary failed to start",
  "Binary output is not valid JSON",
  "Binary output missing team group key"
];

    if(knownErrors.some(e=>error.message?.startsWith(e))){
      return res.status(400).json({
        success:false,
        message:error.message
      });
    }

    console.error("[generateTeams]",error);

    res.status(500).json({
      success:false,
      message:"Internal server error"
    });

  }

};