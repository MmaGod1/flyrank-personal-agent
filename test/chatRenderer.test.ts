import { describe, it, expect } from "vitest";
import {
  mdToHtml,
  escapeHtml,
  renderMessageBubble,
  sendButtonView,
  THINKING_HTML,
} from "../src/chatRenderer.js";

describe("chat renderer: escapeHtml", () => {
  it("escapes HTML-significant characters so model output can't inject markup", () => {
    const result = escapeHtml('<script>alert("x")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });
});

describe("chat renderer: mdToHtml", () => {
  it("converts **bold** into a real <strong> tag instead of showing literal asterisks", () => {
    const html = mdToHtml("This is **important** information.");
    expect(html).toContain("<strong>important</strong>");
    expect(html).not.toContain("**");
  });

  it("converts a run of '- ' lines into a single <ul> with <li> items", () => {
    const html = mdToHtml("Gaps:\n- TypeScript\n- Testing");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>TypeScript</li>");
    expect(html).toContain("<li>Testing</li>");
  });

  it("still escapes HTML even inside otherwise-markdown text (no injection via bold/list)", () => {
    const html = mdToHtml("**<img src=x onerror=alert(1)>**");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("chat renderer: renderMessageBubble (all part types)", () => {
  it("renders a user message as plain escaped text, not interpreted as markdown", () => {
    const bubble = renderMessageBubble({ kind: "user", text: "Is **this** bold?" });
    expect(bubble.className).toBe("msg user");
    // User's own literal asterisks should NOT become <strong> — only
    // assistant output goes through markdown rendering.
    expect(bubble.html).not.toContain("<strong>");
  });

  it("renders an assistant message with markdown applied", () => {
    const bubble = renderMessageBubble({ kind: "assistant", text: "Missing **TypeScript**." });
    expect(bubble.className).toBe("msg assistant md");
    expect(bubble.html).toContain("<strong>TypeScript</strong>");
  });

  it("renders the pending/thinking state with the expected thinking markup", () => {
    const bubble = renderMessageBubble({ kind: "thinking" });
    expect(bubble.className).toBe("msg thinking");
    expect(bubble.html).toBe(THINKING_HTML);
  });

  it("renders an error state as a visible assistant-style message with the error text", () => {
    const bubble = renderMessageBubble({ kind: "error", text: "The assistant could not respond right now." });
    expect(bubble.html).toContain("could not respond");
  });
});

describe("chat renderer: sendButtonView (idle vs streaming)", () => {
  it("shows a Send affordance when idle", () => {
    const view = sendButtonView("idle");
    expect(view.iconKey).toBe("send");
    expect(view.isStopping).toBe(false);
    expect(view.ariaLabel.toLowerCase()).toContain("send");
  });

  it("shows a Stop affordance while a response is streaming", () => {
    const view = sendButtonView("sending");
    expect(view.iconKey).toBe("stop");
    expect(view.isStopping).toBe(true);
    expect(view.ariaLabel.toLowerCase()).toContain("stop");
  });
});