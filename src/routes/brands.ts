import { Router } from "express";
import { getBrands, getBrandById } from "../controllers/brandControllers";

const router = Router();

router.get("/", getBrands);
router.get("/:productId", getBrandById);

export default router;
