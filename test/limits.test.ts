import { describe, it, expect } from "vitest";
import { truncateHistory, lengthError, MAX_CONVERSATION_MESSAGES } from "../src/limits.js";

describe("limits: lengthError", () => {
  it("produces a human-readable message including the field name and max length", () => {
    const message = lengthError("Job posting", 20000);
    expect(message).toContain("Job posting");
    expect(message).toContain("20,000");
  });
});

describe("limits: truncateHistory", () => {
  it("returns the array unchanged when it is within the limit", () => {
    const messages = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(truncateHistory(messages, 10)).toEqual(messages);
  });

  it("keeps only the most recent N messages when over the limit", () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({ id: i }));
    const result = truncateHistory(messages, 5);
    expect(result).toHaveLength(5);
    // Must be the LAST 5, not the first 5 — this is what makes a long
    // conversation still make sense to the model after truncation.
    expect(result.map((m) => m.id)).toEqual([45, 46, 47, 48, 49]);
  });

  it("uses MAX_CONVERSATION_MESSAGES as the default cap when none is given", () => {
    const messages = Array.from({ length: MAX_CONVERSATION_MESSAGES + 10 }, (_, i) => ({ id: i }));
    const result = truncateHistory(messages);
    expect(result).toHaveLength(MAX_CONVERSATION_MESSAGES);
  });

  it("handles an already-empty history without throwing", () => {
    expect(truncateHistory([], 10)).toEqual([]);
  });
});