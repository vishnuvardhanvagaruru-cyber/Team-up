import { Router, type IRouter } from "express";
import healthRouter from "./health";
import profileRouter from "./profile";
import teamupRouter from "./teamup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(profileRouter);
router.use(teamupRouter);

export default router;
