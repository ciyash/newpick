
import { createUserService, getAllUserService } from "./test.service.js";

export const createUser = async (req, res) => {
    try {
        const result = await createUserService(req.body);
        res.status(201).json({
            success: true,
            data: result,
            message: "User created successfully"
        })
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        })
    }
}

export const getAllUser = async (req, res) => {
    try {
        const result = await getAllUserService();
        res.status(200).json({
            success: true,
            total: result.length,
            data: result
        })
    }
    catch (error) {
        res.status(500).json({success: false,
              message: "Internal server error",
              error: error.message
        })
    }
}
