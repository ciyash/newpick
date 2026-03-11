import Router from 'express'
import { getAllPlayers } from './test.controller.js';

const router=Router()

router.get("/players", getAllPlayers);

export default router