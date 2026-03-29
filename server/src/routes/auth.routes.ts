import { Router } from "express";
import { postSignup, postLogin, getMe, putMe } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/signup", postSignup);
authRouter.post("/login", postLogin);
authRouter.get("/me", requireAuth, getMe);
authRouter.put("/me", requireAuth, putMe);
