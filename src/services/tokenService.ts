import db from "../db";
import { clientToken } from "../db/schema";
import { eq } from "drizzle-orm";

export async function saveOrUpdateToken(newToken: string) {
  // Check if any entry exists
  const existing = await db.select().from(clientToken).limit(1);

  if (existing.length === 0) {
    // Insert first entry
    await db.insert(clientToken).values({
      token: newToken,
    });
    console.log("[db] token inserted");
  } else {
    // Update the existing entry (id=1 or the found id)
    await db
      .update(clientToken)
      .set({ token: newToken })
      .where(eq(clientToken.id, existing[0].id));
    console.log("[db] token updated");
  }
}
