import { Request, Response } from "express";
import axios from "axios";
import db from "../db/index";
import {clientToken} from "../db/schema"
import { eq } from "drizzle-orm";

const BASE_URL = process.env.BASE_URL;

// Utility to get token from DB
const getTokenFromDb = async () => {
  const [tokenRow] = await db.select().from(clientToken).where(eq(clientToken.id, 1));
  if (!tokenRow) throw new Error("Client token not found");
  return tokenRow.token;
};

// GET /v1/partners/products
export const getBrands = async (req: Request, res: Response) => {
  try {
   
    const token = await getTokenFromDb();
     console.log("adjskhbuaiosdbh",token,)
    const response = await axios.get(`${BASE_URL}/v1/partners/products`, {
      headers: { Authorization: `Bearer ${token}` },
      params: req.query, // Axios automatically serializes query parameters
    });
    res.json(response.data);
  } catch (err: any) {
    console.error(err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message || "Failed to fetch brands" });
  }
};

// GET /v1/partners/products/:productId
export const getBrandById = async (req: Request, res: Response) => {
  try {
    const token = await getTokenFromDb();
    const { productId } = req.params;

    const response = await axios.get(`${BASE_URL}/v1/partners/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    res.json(response.data);
  } catch (err: any) {
    console.error(err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.message || "Failed to fetch brand by ID" });
  }
};
