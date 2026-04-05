import express from 'express'
import { createUser, getAllUser } from './test.controller.js';



const router = express.Router();

router.post("/create", createUser);

router.get("/get-all", getAllUser);    

export default router;   