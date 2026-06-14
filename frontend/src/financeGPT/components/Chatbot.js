import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import PDFUploader from "./PdfUploader";
import {
  faFileDownload,
  faPaperPlane,
  faUndoAlt,
  faEye,
  faRobot,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import "../styles/Chatbot.css";
import fetcher from "../../http/RequestConfig";
import TypingIndicator from "./TypingIndicator";
import Modal from "../../components/Modal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const Chatbot = (props) => {
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [showInstallationModal, setShowInstallationModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = React.useState(0);
  const [timeLeft, setTimeLeft] = React.useState("");

  useEffect(() => {
    loadLatestChat();
    handleLoadChat();
    setMessages([
      {
        message: "Hello, I am your financial assistant, how can I help you?",
        sentTime: "just now",
        direction: "incoming",
      },
    ]);
  }, []);

  useEffect(() => {
    handleLoadChat();
  }, [props.selectedChatId, props.forceUpdate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  };

  const loadLatestChat = async () => {
    try {
      const response = await fetcher("find-most-recent-chat", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const response_data = await response.json();
      props.handleChatSelect(response_data.chat_info.id);
      props.setCurrChatName(response_data.chat_info.chat_name);
    } catch (e) {
      console.error("Error loading latest chat", e);
    }
  };

  const handleDownload = async () => {
    if (props.selectedChatId === null) return;
    try {
      await fetcher("download-chat-history", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: props.selectedChatId,
          chat_type: props.chat_type,
        }),
      });
    } catch (e) {
      console.error("Error downloading chat history:", e);
    }
  };

  const togglePopup = (index) => {
    props.setActiveMessageIndex(
      props.activeMessageIndex === index ? null : index
    );
  };

  const handleTryMessage = (text, chat_id, isPrivate) => {
    if (!text.trim()) return;
    if (chat_id === null || chat_id === undefined) {
      props.createNewChat().then((newChatId) => {
        if (newChatId) handleSendMessage(text, newChatId, isPrivate);
      });
    } else {
      handleSendMessage(text, chat_id, isPrivate);
    }
  };

  const handleSendMessage = async (text, chat_id) => {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }

    const tempMessageId = Date.now();
    setMessages((prev) => [
      ...prev,
      { message: text, direction: "outgoing" },
      { id: tempMessageId, isTyping: true, direction: "incoming" },
    ]);

    try {
      scrollToBottom();
      const response = await fetcher("process-message-pdf", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          chat_id: chat_id,
          model_type: props.isPrivate,
          model_key: props.confirmedModelKey,
        }),
      });
      const response_data = await response.json();
      const answer = response_data.answer;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessageId
            ? { ...msg, isTyping: false, message: answer, id: undefined }
            : msg
        )
      );
      handleLoadChat();
      scrollToBottom();
    } catch (e) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessageId
            ? { ...msg, isTyping: false, message: "Model not available. Please install a local model or provide an API key.", id: undefined }
            : msg
        )
      );
      setShowInstallationModal(true);
    }
  };

  const pollOllamaStatus = async () => {
    try {
      const endpoint = props.isPrivate === 0 ? "/llama-status" : "/mistral-status";
      const response = await fetcher(endpoint, { method: "POST" });
      const status = await response.json();

      if (status.progress === 100 || (!status.running && status.completed)) {
        setIsLoading(false);
        setShowInstallationModal(false);
        setProgress(0);
        setTimeLeft("");
      } else {
        setTimeLeft(status.time_left || "Calculating...");
        setProgress(status.progress || 0);
        setTimeout(pollOllamaStatus, 3000);
      }
    } catch (error) {
      console.error("Failed to fetch install status:", error);
      setIsLoading(false);
      setTimeLeft("");
      setShowInstallationModal(false);
    }
  };

  const installDependencies = async () => {
    setIsLoading(true);
    pollOllamaStatus();
    try {
      const endpoint = props.isPrivate === 0 ? "/install-llama" : "/install-mistral";
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      });
      const responseData = await response.json();
      if (!responseData.success) {
        console.error(responseData.message);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Installation failed:", error);
      setIsLoading(false);
    }
  };

  const handleLoadChat = async () => {
    try {
      const response = await fetcher("retrieve-messages-from-chat", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: props.selectedChatId,
          chat_type: props.chat_type,
        }),
      });

      setMessages([
        {
          message: "Hello, I am your financial assistant, how can I help you?",
          sentTime: "just now",
          direction: "incoming",
        },
      ]);

      const response_data = await response.json();
      const transformedMessages = response_data.messages.map((item) => ({
        message: item.message_text,
        direction: item.sent_from_user === 1 ? "outgoing" : "incoming",
        relevant_chunks: item.relevant_chunks,
      }));
      setMessages((prev) => [...prev, ...transformedMessages]);
    } catch (error) {
      console.error("Error loading chat messages:", error);
    }
  };

  const handleReset = async () => {
    try {
      await fetcher("reset-everything", { method: "POST" });
    } catch (e) {
      console.error("Failed to reset:", e);
    }
    setMessages([
      {
        message: "Hello, I am your financial assistant, how can I help you?",
        sentTime: "just now",
        direction: "incoming",
      },
    ]);
  };

  const handleTextareaInput = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTryMessage(e.target.value, props.selectedChatId, props.isPrivate);
    }
  };

  const modelName = props.isPrivate === 0 ? "LLaMA 2" : "Mistral";

  return (
    <>
      <Modal
        isOpen={showInstallationModal}
        onClose={() => setShowInstallationModal(false)}
        title={isLoading ? "Installing Model..." : `Install ${modelName}`}
      >
        {isLoading ? (
          <div className="w-full">
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden mb-2">
              <div
                className="h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, background: "linear-gradient(90deg, #2E5C82, #50B7C3)" }}
              />
            </div>
            <p className="text-sm text-gray-400">{timeLeft || "Downloading..."}</p>
          </div>
        ) : (
          <p className="text-gray-300 mb-4">
            You have not installed {modelName}. Please install it to use local inference.
          </p>
        )}
        <button
          onClick={installDependencies}
          disabled={isLoading}
          className={`mt-4 w-full py-2 rounded-lg font-semibold transition-colors ${
            isLoading
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white hover:opacity-90"
          }`}
        >
          {isLoading ? "Installing..." : `Download ${modelName}`}
        </button>
      </Modal>

      <div className="min-h-[90vh] h-[90vh] mt-2 relative bg-[#12141E] p-4 w-full rounded-2xl border border-gray-800">
        {props.currChatName ? (
          <>
            {/* Header */}
            <div className="flex flex-row justify-between items-center pb-3 border-b border-gray-700">
              <button
                onClick={handleReset}
                className="text-gray-400 hover:text-[#50B7C3] transition-colors p-1 rounded"
                title="Reset chat"
              >
                <FontAwesomeIcon icon={faUndoAlt} />
              </button>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-green-400 rounded-full" />
                <div className="text-white font-semibold text-sm">{props.currChatName}</div>
              </div>
              <button
                className="text-gray-400 hover:text-[#50B7C3] transition-colors p-1 rounded"
                onClick={handleDownload}
                title="Download chat history"
              >
                <FontAwesomeIcon icon={faFileDownload} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex flex-col space-y-3 py-4 h-[70vh] overflow-y-auto relative pr-1">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message ${msg.direction === "incoming" ? "incoming" : "outgoing"}`}
                >
                  {/* Avatar */}
                  <div className="message-avatar">
                    {msg.direction === "incoming" ? (
                      <FontAwesomeIcon icon={faRobot} className="text-white text-xs" />
                    ) : (
                      <FontAwesomeIcon icon={faUser} className="text-white text-xs" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div className="message-content">
                    <div className="message-bubble">
                      {msg.isTyping ? (
                        <TypingIndicator />
                      ) : msg.direction === "incoming" ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.message}
                        </ReactMarkdown>
                      ) : (
                        <span>{msg.message}</span>
                      )}
                    </div>

                    {/* Source chunks eye icon */}
                    {msg.direction === "incoming" && index !== 0 && !msg.isTyping && (
                      <div className="flex justify-end mt-1">
                        <FontAwesomeIcon
                          icon={faEye}
                          onClick={() => togglePopup(index)}
                          className="eye-icon text-gray-400 cursor-pointer text-xs"
                          title="View sources"
                        />
                      </div>
                    )}

                    {props.activeMessageIndex === index && (
                      <div
                        className="absolute bg-gray-900 text-white border border-gray-700 rounded-xl p-3 z-50 overflow-y-auto text-xs"
                        style={{ width: "70%", maxHeight: "200px", whiteSpace: "pre-wrap" }}
                        onClick={() => props.setRelevantChunk(msg.relevant_chunks)}
                      >
                        <p className="font-semibold text-[#50B7C3] mb-2">Sources</p>
                        <p>{msg.relevant_chunks}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="absolute bottom-10 left-4 right-4 flex items-end space-x-2">
              <div className="bg-[#1E2030] rounded-xl p-2 cursor-pointer border border-gray-700 hover:border-[#50B7C3] transition-colors">
                <PDFUploader
                  chat_id={props.selectedChatId}
                  handleForceUpdate={props.handleForceUpdate}
                />
              </div>
              <textarea
                ref={inputRef}
                rows={1}
                className="flex-1 rounded-xl bg-[#1E2030] border border-gray-700 focus:border-[#50B7C3] focus:ring-0 text-white placeholder:text-gray-500 px-4 py-3 resize-none overflow-hidden transition-colors text-sm"
                placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                onInput={handleTextareaInput}
                onKeyDown={handleKeyDown}
              />
              <button
                className="bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white p-3 rounded-xl hover:opacity-90 transition-opacity"
                onClick={() => {
                  const text = inputRef.current?.value || "";
                  handleTryMessage(text, props.selectedChatId, props.isPrivate);
                }}
              >
                <FontAwesomeIcon icon={faPaperPlane} className="w-4" />
              </button>
            </div>

            <div className="absolute bottom-3 right-4 text-gray-600 text-xs">
              Powered by <span className="font-bold text-[#50B7C3]">Anote</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <FontAwesomeIcon icon={faRobot} className="text-4xl mb-4 text-[#50B7C3]" />
            <p>Select a chat or create a new one to get started</p>
          </div>
        )}
      </div>
    </>
  );
};

export default Chatbot;
