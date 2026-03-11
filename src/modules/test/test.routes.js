import Router from 'express'
import { getAllPlayers, testNotification } from './test.controller.js';

const router=Router()

router.get("/notification", testNotification);

router.get("/players", getAllPlayers);

export default router