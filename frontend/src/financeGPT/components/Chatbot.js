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
import TypingIndicator from "../../components/TypingIndicator";

const Chatbot = (props) => {
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [showInstallationModal, setShowInstallationModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
      console.error("Error loading latest chat:", e);
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
        if (newChatId) {
          handleSendMessage(text, newChatId, isPrivate);
        } else {
          console.error("Failed to create new chat");
        }
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
            ? { ...msg, message: answer, isTyping: false, id: undefined }
            : msg
        )
      );
      handleLoadChat();
      scrollToBottom();
    } catch (e) {
      setMessages((prev) => prev.filter((msg) => msg.id !== tempMessageId));
      setShowInstallationModal(true);
    }
  };

  const pollOllamaStatus = async () => {
    const endpoint = props.isPrivate === 0 ? "/llama-status" : "/mistral-status";
    try {
      const response = await fetcher(endpoint, { method: "POST" });
      const status = await response.json();

      if (status.progress === 100 || (!status.running && status.completed)) {
        setIsLoading(false);
        setShowInstallationModal(false);
        setProgress(0);
        setTimeLeft("");
      } else {
        setTimeLeft(status.time_left || "Calculating time left...");
        setProgress(status.progress);
        setTimeout(pollOllamaStatus, 3000);
      }
    } catch (error) {
      console.error("Failed to fetch model install status:", error);
      setIsLoading(false);
      setTimeLeft("");
      setShowInstallationModal(false);
    }
  };

  const installDependencies = async () => {
    setIsLoading(true);
    pollOllamaStatus();
    const endpoint = props.isPrivate === 0 ? "/install-llama" : "/install-mistral";
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      const responseData = await response.json();
      if (!responseData.success) {
        console.error(responseData.message);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Installation initiation failed:", error);
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
      setMessages([
        {
          message: "Hello, I am your financial assistant, how can I help you?",
          sentTime: "just now",
          direction: "incoming",
        },
      ]);
    } catch (error) {
      console.error("Failed to reset:", error);
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTryMessage(e.target.value, props.selectedChatId, props.isPrivate);
    }
  };

  const handleInputResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const modelName = props.isPrivate === 0 ? "LLaMA" : "Mistral";

  const installationModal = showInstallationModal ? (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          zIndex: 999,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "24%",
          right: "24%",
          transform: "translateY(-50%)",
          zIndex: 1000,
          padding: 20,
          borderRadius: 10,
          boxShadow: "0px 0px 15px rgba(0,0,0,0.5)",
          textAlign: "center",
        }}
        className="bg-gray-800 text-white"
      >
        <div className="flex justify-between items-center">
          {isLoading ? (
            <div
              className="my-2"
              style={{
                width: "100%",
                backgroundColor: "#ddd",
                borderRadius: "10px",
                overflow: "hidden",
                marginRight: "8px",
              }}
            >
              <div
                style={{
                  height: "20px",
                  width: `${progress}%`,
                  backgroundColor: "#4CAF50",
                }}
              />
            </div>
          ) : (
            <div className="my-2 w-full text-center">
              You have not installed {modelName}. Please install below.
            </div>
          )}
          <p className="ml-2 whitespace-nowrap">{timeLeft}</p>
        </div>
        <div className="w-full flex justify-center mt-4">
          <button
            onClick={installDependencies}
            disabled={isLoading}
            className={`w-1/2 mx-2 py-2 bg-gray-700 rounded-lg hover:bg-gray-900 ${
              isLoading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            Download {modelName}
          </button>
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      {showInstallationModal && installationModal}
      <div className="min-h-[90vh] h-[90vh] mt-2 relative bg-[#2A2C38] p-4 w-full rounded-2xl">
        {props.currChatName ? (
          <>
            <div className="flex flex-row justify-between items-center mb-2">
              <FontAwesomeIcon
                icon={faUndoAlt}
                onClick={handleReset}
                className="reset-icon"
              />
              <div className="text-white font-bold">{props.currChatName}</div>
              <div className="download-button send-button">
                <FontAwesomeIcon
                  icon={faFileDownload}
                  onClick={handleDownload}
                  className="file-upload cursor-pointer"
                />
              </div>
            </div>
            <hr className="border-gray-600" />

            {/* Message list */}
            <div className="flex flex-col space-y-3 h-[70vh] overflow-y-auto relative pt-3 pb-2">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex items-end gap-2 ${
                    msg.direction === "incoming" ? "flex-row" : "flex-row-reverse"
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                      msg.direction === "incoming"
                        ? "bg-[#50B7C3] text-white"
                        : "bg-gray-500 text-white"
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={msg.direction === "incoming" ? faRobot : faUser}
                      className="w-3"
                    />
                  </div>

                  {/* Bubble */}
                  <div
                    className={`relative max-w-[78%] rounded-2xl px-4 py-2 text-white text-sm leading-relaxed ${
                      msg.direction === "incoming"
                        ? "bg-gray-700 rounded-tl-sm"
                        : "bg-[#2E5C82] rounded-tr-sm"
                    }`}
                  >
                    {msg.isTyping ? (
                      <TypingIndicator />
                    ) : (
                      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {msg.message}
                      </span>
                    )}

                    {msg.direction === "incoming" && index !== 0 && !msg.isTyping && (
                      <FontAwesomeIcon
                        style={{ height: "11px", cursor: "pointer", marginLeft: "8px" }}
                        icon={faEye}
                        onClick={() => togglePopup(index)}
                        className="text-gray-400 hover:text-white"
                      />
                    )}

                    {props.activeMessageIndex === index && (
                      <div
                        style={{
                          position: "absolute",
                          border: "1px solid #ccc",
                          padding: "10px",
                          borderRadius: "8px",
                          boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                          width: "320px",
                          maxHeight: "200px",
                          overflowY: "auto",
                          whiteSpace: "pre-wrap",
                          zIndex: 10,
                          top: "100%",
                          left: 0,
                        }}
                        className="bg-gray-900 text-white text-xs mt-1"
                      >
                        {props.setRelevantChunk(msg.relevant_chunks)}
                        <p>{msg.relevant_chunks}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="absolute bottom-12 flex items-end w-[95%] mx-auto gap-2">
              <div className="text-white bg-[#3A3B41] rounded-xl p-2 cursor-pointer flex-shrink-0">
                <PDFUploader
                  chat_id={props.selectedChatId}
                  handleForceUpdate={props.handleForceUpdate}
                />
              </div>
              <textarea
                className="flex-1 rounded-xl bg-[#3A3B41] border-none focus:ring-0 focus:border-white text-white placeholder:text-gray-300 resize-none overflow-hidden py-2 px-3 text-sm"
                placeholder="Type message here... (Enter to send, Shift+Enter for newline)"
                ref={inputRef}
                rows={1}
                onInput={handleInputResize}
                onKeyDown={handleInputKeyDown}
              />
              <div
                className="text-white bg-[#3A3B41] p-2 rounded-xl cursor-pointer flex-shrink-0"
                onClick={() =>
                  handleTryMessage(
                    inputRef.current?.value,
                    props.selectedChatId,
                    props.isPrivate
                  )
                }
              >
                <FontAwesomeIcon className="w-8" icon={faPaperPlane} />
              </div>
            </div>

            <div className="absolute bottom-4 right-4 text-gray-400 text-xs">
              Powered by <span className="anote font-semibold">Anote</span>
            </div>
          </>
        ) : (
          <div className="text-white text-center mt-8">
            Create a new chat from the left sidebar
          </div>
        )}
      </div>
    </>
  );
};

export default Chatbot;
