"""Builders for chat history exports (Markdown and printable HTML).

The HTML variant is a self-contained, print-styled document; the frontend
opens it in a hidden frame and triggers the print dialog so users can save
it as a PDF without the backend needing a PDF rendering library.
"""
import html
import re

SOURCE_DOC_PATTERN = re.compile(r"Document: (.+?):")
BOLD_PATTERN = re.compile(r"\*\*(.+?)\*\*")
INLINE_CODE_PATTERN = re.compile(r"`([^`]+)`")
HEADING_PATTERN = re.compile(r"^#{1,6}\s+(.+)$", re.MULTILINE)


def render_basic_markdown(escaped_text):
    """Convert the markdown constructs LLM answers use most (bold, inline
    code, headings) to HTML. Input must already be HTML-escaped; everything
    else is left as readable plain text inside a pre-wrap container."""
    rendered = HEADING_PATTERN.sub(r"<strong>\1</strong>", escaped_text)
    rendered = BOLD_PATTERN.sub(r"<strong>\1</strong>", rendered)
    rendered = INLINE_CODE_PATTERN.sub(r"<code>\1</code>", rendered)
    return rendered


def extract_source_names(relevant_chunks):
    """Pull unique document names, in order, out of a stored sources blob."""
    if not relevant_chunks:
        return []

    seen = []
    for name in SOURCE_DOC_PATTERN.findall(relevant_chunks):
        cleaned = name.strip()
        if cleaned and cleaned not in seen:
            seen.append(cleaned)
    return seen


def sanitize_filename(name, fallback="chat"):
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "", name or "").strip().replace(" ", "-")
    return cleaned or fallback


def build_markdown_export(chat_name, ticker, document_names, messages, exported_at):
    lines = [f"# {chat_name or 'Chat Export'}", ""]
    lines.append(f"*Exported from PrivateGPT on {exported_at}*")
    lines.append("")

    if document_names:
        lines.append(f"**Documents:** {', '.join(document_names)}")
    if ticker:
        lines.append(f"**Ticker:** {ticker}")
    if document_names or ticker:
        lines.append("")

    lines.append("---")
    lines.append("")

    for message in messages:
        speaker = "User" if message.get("sent_from_user") == 1 else "Assistant"
        lines.append(f"**{speaker}:**")
        lines.append("")
        lines.append((message.get("message_text") or "").strip())
        lines.append("")

        sources = extract_source_names(message.get("relevant_chunks"))
        if sources:
            lines.append(f"> Sources: {', '.join(sources)}")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body {{
    font-family: Georgia, 'Times New Roman', serif;
    color: #1a1a1a;
    max-width: 46rem;
    margin: 2rem auto;
    padding: 0 1.5rem;
    line-height: 1.55;
  }}
  header {{
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 0.75rem;
    margin-bottom: 1.5rem;
  }}
  header h1 {{ margin: 0 0 0.25rem; font-size: 1.6rem; }}
  header p {{ margin: 0.15rem 0; color: #555; font-size: 0.85rem; }}
  .message {{ margin-bottom: 1.25rem; page-break-inside: avoid; }}
  .speaker {{
    font-family: Helvetica, Arial, sans-serif;
    font-weight: bold;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }}
  .speaker.user {{ color: #2e5c82; }}
  .speaker.assistant {{ color: #1a7f6b; }}
  .text {{ white-space: pre-wrap; }}
  .text code {{
    font-family: Menlo, Consolas, monospace;
    font-size: 0.85em;
    background: #f2f2f2;
    padding: 0 3px;
    border-radius: 3px;
  }}
  .sources {{
    font-family: Helvetica, Arial, sans-serif;
    font-size: 0.75rem;
    color: #777;
    margin-top: 0.35rem;
  }}
  @media print {{
    body {{ margin: 0.5in auto; }}
  }}
</style>
</head>
<body>
<header>
  <h1>{title}</h1>
  <p>Exported from PrivateGPT on {exported_at}</p>
  {meta_lines}
</header>
{messages}
</body>
</html>
"""


def build_html_export(chat_name, ticker, document_names, messages, exported_at):
    meta_lines = []
    if document_names:
        meta_lines.append(f"<p>Documents: {html.escape(', '.join(document_names))}</p>")
    if ticker:
        meta_lines.append(f"<p>Ticker: {html.escape(ticker)}</p>")

    message_blocks = []
    for message in messages:
        is_user = message.get("sent_from_user") == 1
        speaker_class = "user" if is_user else "assistant"
        speaker_label = "User" if is_user else "Assistant"
        text = render_basic_markdown(html.escape((message.get("message_text") or "").strip()))

        sources = extract_source_names(message.get("relevant_chunks"))
        sources_html = (
            f'<div class="sources">Sources: {html.escape(", ".join(sources))}</div>'
            if sources
            else ""
        )

        message_blocks.append(
            f'<div class="message">'
            f'<div class="speaker {speaker_class}">{speaker_label}</div>'
            f'<div class="text">{text}</div>'
            f"{sources_html}"
            f"</div>"
        )

    return HTML_TEMPLATE.format(
        title=html.escape(chat_name or "Chat Export"),
        exported_at=html.escape(exported_at),
        meta_lines="\n  ".join(meta_lines),
        messages="\n".join(message_blocks),
    )
