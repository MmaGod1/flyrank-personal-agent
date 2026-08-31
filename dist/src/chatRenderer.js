/**
 * Pure, DOM-free chat rendering logic, extracted from the inline <script>
 * in index.html so it can be unit tested directly (this project has no
 * framework/component model, so this module is the closest equivalent
 * to a "chat message renderer component").
 *
 * index.html imports this as an ES module and calls these functions
 * instead of duplicating the logic inline.
 */
export function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/**
 * Converts a small, safe subset of markdown (bold, italic, inline code,
 * bullet lists) into HTML. Always escapes HTML first, so this is safe to
 * use on model-generated text even if that text happens to contain
 * angle brackets or quotes.
 */
export function mdToHtml(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, "$1<em>$2</em>");
    const lines = safe.split("\n");
    let html = "";
    let inList = false;
    for (const line of lines) {
        const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (bulletMatch) {
            if (!inList) {
                html += "<ul>";
                inList = true;
            }
            html += "<li>" + bulletMatch[1] + "</li>";
        }
        else {
            if (inList) {
                html += "</ul>";
                inList = false;
            }
            html += (html ? "<br>" : "") + line;
        }
    }
    if (inList)
        html += "</ul>";
    return html;
}
export const THINKING_HTML = 'Thinking<span class="thinking-dots"><span></span><span></span><span></span></span>';
/**
 * Renders any chat "message part" into its display className + HTML.
 * Covers every part type this chat can show: a user's own message
 * (plain text, no markdown needed), an assistant reply (rendered as
 * safe markdown, since Gemini output uses bold text and lists), the
 * "thinking" pending state shown before the first streamed token, and
 * an error state shown if the request fails outright.
 */
export function renderMessageBubble(part) {
    switch (part.kind) {
        case "user":
            return { className: "msg user", html: escapeHtml(part.text) };
        case "assistant":
            return { className: "msg assistant md", html: mdToHtml(part.text) };
        case "thinking":
            return { className: "msg thinking", html: THINKING_HTML };
        case "error":
            return { className: "msg assistant", html: escapeHtml(part.text) };
    }
}
/**
 * The Send/Stop button has exactly two states: idle (ready to send) and
 * sending (streaming in progress, button doubles as Stop). Kept as a
 * pure function so the mapping from state -> label/icon/class can be
 * tested without touching the DOM.
 */
export function sendButtonView(state) {
    if (state === "sending") {
        return { ariaLabel: "Stop generating response", iconKey: "stop", isStopping: true };
    }
    return { ariaLabel: "Send message", iconKey: "send", isStopping: false };
}
