import { Router } from "express";
import {
  placeOrder,
  getOrderById,
  getOrderByReference,
  getVoucherById,
} from "../controllers/orderControllers";

const router = Router();

router.post("/", placeOrder);
router.get("/:orderId", getOrderById);
router.get("/by-reference/:referenceId", getOrderByReference);
router.get("/vouchers/:id", getVoucherById);

export default router;
