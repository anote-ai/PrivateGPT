import React, { useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPaperPlane,
  faLanguage,
  faRobot,
  faUser,
  faCopy,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import "../../styles/Chatbot.css";
import fetcher from "../../../http/RequestConfig";
import TypingIndicator from "../TypingIndicator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const LANGUAGES = [
  { code: "Spanish", label: "Spanish" },
  { code: "French", label: "French" },
  { code: "German", label: "German" },
  { code: "Italian", label: "Italian" },
  { code: "Portuguese", label: "Portuguese" },
  { code: "Chinese (Simplified)", label: "Chinese (Simplified)" },
  { code: "Chinese (Traditional)", label: "Chinese (Traditional)" },
  { code: "Japanese", label: "Japanese" },
  { code: "Korean", label: "Korean" },
  { code: "Arabic", label: "Arabic" },
  { code: "Russian", label: "Russian" },
  { code: "Hindi", label: "Hindi" },
  { code: "Dutch", label: "Dutch" },
  { code: "Polish", label: "Polish" },
  { code: "Swedish", label: "Swedish" },
  { code: "Turkish", label: "Turkish" },
  { code: "Vietnamese", label: "Vietnamese" },
  { code: "Thai", label: "Thai" },
  { code: "Hebrew", label: "Hebrew" },
  { code: "Ukrainian", label: "Ukrainian" },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="text-gray-500 hover:text-[#50B7C3] transition-colors ml-2"
      title="Copy translation"
    >
      <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-xs" />
    </button>
  );
}

const ChatbotTranslation = (props) => {
  const [sourceText, setSourceText] = useState("");
  const [targetLang, setTargetLang] = useState("Spanish");
  const [sourceLang, setSourceLang] = useState("English");
  const [messages, setMessages] = useState([
    {
      message: "Hello! I'm your AI translation assistant. Type text below and choose target languages to translate.",
      direction: "incoming",
    },
  ]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;

    const tempId = Date.now();
    setMessages((prev) => [
      ...prev,
      { message: `**Translate to ${targetLang}:** ${sourceText}`, direction: "outgoing" },
      { id: tempId, isTyping: true, direction: "incoming" },
    ]);
    setSourceText("");

    try {
      scrollToBottom();
      const response = await fetcher("translate-text", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sourceText,
          source_language: sourceLang,
          target_language: targetLang,
          chat_id: props.selectedChatId,
          model_key: props.confirmedModelKey,
        }),
      });
      const data = await response.json();
      const translation = data.translation;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? { ...msg, isTyping: false, message: translation, translatedText: translation, id: undefined }
            : msg
        )
      );
      scrollToBottom();
    } catch (e) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId
            ? { ...msg, isTyping: false, message: "Translation failed. Please check your API key settings.", id: undefined }
            : msg
        )
      );
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTranslate();
    }
  };

  const handleTextareaInput = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 150) + "px";
  };

  return (
    <div className="min-h-[90vh] h-[90vh] mt-2 relative bg-[#12141E] p-4 w-full rounded-2xl border border-gray-800 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-700 mb-3">
        <div className="flex items-center space-x-2">
          <FontAwesomeIcon icon={faLanguage} className="text-[#50B7C3] text-lg" />
          <span className="text-white font-semibold text-sm">AI Translation</span>
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-400">
          <span>Powered by</span>
          <span className="font-bold text-[#50B7C3]">Anote</span>
        </div>
      </div>

      {/* Language selectors */}
      <div className="flex items-center space-x-2 mb-3">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="flex-1 bg-[#1E2030] border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:border-[#50B7C3] focus:ring-0 cursor-pointer"
        >
          <option value="Auto-detect">Auto-detect</option>
          <option value="English">English</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <div className="text-gray-500 text-lg font-bold">→</div>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="flex-1 bg-[#1E2030] border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:border-[#50B7C3] focus:ring-0 cursor-pointer"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Chat / Translation history */}
      <div className="flex flex-col space-y-3 flex-1 overflow-y-auto pr-1 mb-3">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${msg.direction === "incoming" ? "incoming" : "outgoing"}`}
          >
            <div className="message-avatar">
              {msg.direction === "incoming" ? (
                <FontAwesomeIcon icon={faLanguage} className="text-white text-xs" />
              ) : (
                <FontAwesomeIcon icon={faUser} className="text-white text-xs" />
              )}
            </div>
            <div className="message-content flex-1">
              <div className="message-bubble">
                {msg.isTyping ? (
                  <TypingIndicator />
                ) : msg.direction === "incoming" ? (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.message}
                      </ReactMarkdown>
                    </div>
                    {msg.translatedText && <CopyButton text={msg.translatedText} />}
                  </div>
                ) : (
                  <span>{msg.message}</span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex items-end space-x-2 mt-auto">
        <textarea
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          rows={1}
          className="flex-1 rounded-xl bg-[#1E2030] border border-gray-700 focus:border-[#50B7C3] focus:ring-0 text-white placeholder:text-gray-500 px-4 py-3 resize-none overflow-hidden transition-colors text-sm"
          placeholder="Enter text to translate... (Enter to translate, Shift+Enter for new line)"
          onInput={handleTextareaInput}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleTranslate}
          className="bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white p-3 rounded-xl hover:opacity-90 transition-opacity"
        >
          <FontAwesomeIcon icon={faPaperPlane} className="w-4" />
        </button>
      </div>
    </div>
  );
};

export default ChatbotTranslation;
