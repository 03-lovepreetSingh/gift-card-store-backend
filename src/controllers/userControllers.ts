import { Request, Response } from "express";
import { drizzle } from "drizzle-orm/node-postgres";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import db from "../db";

export const getUsers = async (req: Request, res: Response) => {
  const allUsers = await db.select().from(users);
  res.json(allUsers);
};

export const createUser = async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  const [user] = await db.insert(users).values({ name }).returning();
  res.status(201).json(user);
};
