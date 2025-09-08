import { Request, Response } from "express";
import axios from "axios";
import db  from "../db";
import { clientToken, orders, vouchers } from "../db/schema";
import { eq } from "drizzle-orm";
import { OrderResponse } from "../types/order"; 
const BASE_URL = process.env.BASE_URL;

// helper to get token
const getTokenFromDb = async () => {
  const [row] = await db.select().from(clientToken).where(eq(clientToken.id, 1));
  if (!row) throw new Error("Client token not found");
  return row.token;
};

// Place Order
export const placeOrder = async (req: Request, res: Response) => {
  try {
    const token = await getTokenFromDb();
       console.log("Token" , token)
    const response = await axios.post(`${BASE_URL}/v1/partners/orders`, req.body, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const orderData : any = response.data;

    // save order
    const [insertedOrder] = await db
      .insert(orders)
      .values({
        partnerOrderId: orderData.id,
        referenceId: orderData.referenceId,
        status: orderData.status,
        rawResponse: orderData,
      })
      .returning();

    // save vouchers if present
    if (orderData.vouchers?.length) {
      await db.insert(vouchers).values(
        orderData.vouchers.map((v: any) => ({
          partnerVoucherId: v.id,
          orderId: insertedOrder.id,
          cardType: v.cardType,
          cardPin: v.cardPin,
          cardNumber: v.cardNumber,
          validTill: v.validTill,
          amount: v.amount,
          rawResponse: v,
        }))
      );
    }
console.log("OderData", orderData)
    res.json(orderData);
  } catch (err: any) {
    console.log("error", err)
    console.error(err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
};

// Get Order by ID
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const token = await getTokenFromDb();
 
    const { orderId } = req.params;

    const response = await axios.get(`${BASE_URL}/v1/partners/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
};

// Get Order by Reference ID
export const getOrderByReference = async (req: Request, res: Response) => {
  try {
    const token = await getTokenFromDb();
    const { referenceId } = req.params;

    const response = await axios.get(`${BASE_URL}/v1/partners/orders/by-reference/${referenceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
};

// Get Voucher
export const getVoucherById = async (req: Request, res: Response) => {
  try {
    const token = await getTokenFromDb();
    const { id } = req.params;

    const response = await axios.get(`${BASE_URL}/v1/partners/orders/vouchers/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    res.json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
};
