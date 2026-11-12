import { describe, expect, it } from "vitest";
import { confirmDialog } from "./confirm";

describe("confirmDialog", () => {
  it("cancels a pending dialog when a new one opens", async () => {
    const first = confirmDialog({ title: "first" });
    void confirmDialog({ title: "second" });
    await expect(first).resolves.toBe(false);
  });
});
