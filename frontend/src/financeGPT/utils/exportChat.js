import fetcher, { downloadResponseAsFile } from "../../http/RequestConfig";

export const EXPORT_FORMATS = [
  { format: "md", label: "Markdown (.md)" },
  { format: "pdf", label: "PDF (print / save)" },
  { format: "csv", label: "CSV (.csv)" },
];

function printHtmlDocument(html) {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      frameWindow.focus();
      frameWindow.print();
      // Leave the frame attached until the print dialog has captured it.
      setTimeout(() => {
        iframe.remove();
        resolve();
      }, 2000);
    };
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

export async function exportChatHistory({ chatId, chatType, format }) {
  const response = await fetcher("download-chat-history", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      chat_type: chatType,
      format: format === "pdf" ? "html" : format,
    }),
  });

  if (format === "pdf") {
    const html = await response.text();
    await printHtmlDocument(html);
    return 'Print dialog opened — choose "Save as PDF" to finish.';
  }

  const extension = format === "md" ? "md" : "csv";
  await downloadResponseAsFile(response, `chat-history-${chatId}.${extension}`);
  return format === "md"
    ? "Chat exported as a Markdown report."
    : "Chat history downloaded as a CSV file.";
}
