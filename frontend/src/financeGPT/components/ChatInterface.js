import React, { useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileDownload, faPaperPlane, faUndoAlt, faEye, faRobot, faUser,
} from "@fortawesome/free-solid-svg-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TypingIndicator from "./TypingIndicator";
import Modal from "../../components/Modal";

function ChatInterface({
  messages,
  currChatName,
  onSend,
  onReset,
  onDownload,
  activeMessageIndex,
  setActiveMessageIndex,
  setRelevantChunk,
  showInstallationModal,
  setShowInstallationModal,
  isLoading,
  progress,
  timeLeft,
  onInstall,
  modelName,
  headerContent,
  placeholder = "Type a message... (Enter to send, Shift+Enter for new line)",
  chatHeight = "70vh",
  messagesEndRef,
}) {
  const inputRef = useRef(null);

  const handleTextareaInput = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = inputRef.current?.value || "";
      if (text.trim()) {
        onSend(text);
        inputRef.current.value = "";
        inputRef.current.style.height = "auto";
      }
    }
  };

  const handleSendClick = () => {
    const text = inputRef.current?.value || "";
    if (text.trim()) {
      onSend(text);
      inputRef.current.value = "";
      inputRef.current.style.height = "auto";
    }
  };

  const togglePopup = (index) => {
    setActiveMessageIndex(activeMessageIndex === index ? null : index);
  };

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
          onClick={onInstall}
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

      {currChatName ? (
        <>
          {/* Header */}
          <div className="flex flex-row justify-between items-center pb-3 border-b border-gray-700">
            <button
              onClick={onReset}
              className="text-gray-400 hover:text-[#50B7C3] transition-colors p-1 rounded"
              title="Reset chat"
            >
              <FontAwesomeIcon icon={faUndoAlt} />
            </button>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              <div className="text-white font-semibold text-sm">{currChatName}</div>
            </div>
            <button
              className="text-gray-400 hover:text-[#50B7C3] transition-colors p-1 rounded"
              onClick={onDownload}
              title="Download chat history"
            >
              <FontAwesomeIcon icon={faFileDownload} />
            </button>
          </div>

          {/* Optional header slot (PDF uploader, ticker input etc.) */}
          {headerContent && <div className="my-2">{headerContent}</div>}

          {/* Messages */}
          <div
            className="flex flex-col space-y-3 py-4 overflow-y-auto relative pr-1"
            style={{ height: chatHeight }}
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`message ${msg.direction === "incoming" ? "incoming" : "outgoing"}`}
              >
                <div className="message-avatar">
                  {msg.direction === "incoming" ? (
                    <FontAwesomeIcon icon={faRobot} className="text-white text-xs" />
                  ) : (
                    <FontAwesomeIcon icon={faUser} className="text-white text-xs" />
                  )}
                </div>
                <div className="message-content">
                  <div className="message-bubble">
                    {msg.isTyping ? (
                      <TypingIndicator />
                    ) : msg.direction === "incoming" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.message}</ReactMarkdown>
                    ) : (
                      <span>{msg.message}</span>
                    )}
                  </div>
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
                  {activeMessageIndex === index && (
                    <div
                      className="absolute bg-gray-900 text-white border border-gray-700 rounded-xl p-3 z-50 overflow-y-auto text-xs"
                      style={{ width: "70%", maxHeight: "200px", whiteSpace: "pre-wrap" }}
                      onClick={() => setRelevantChunk(msg.relevant_chunks)}
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

          {/* Input */}
          <div className="absolute bottom-10 left-4 right-4 flex items-end space-x-2">
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 rounded-xl bg-[#1E2030] border border-gray-700 focus:border-[#50B7C3] focus:ring-0 text-white placeholder:text-gray-500 px-4 py-3 resize-none overflow-hidden transition-colors text-sm"
              placeholder={placeholder}
              onInput={handleTextareaInput}
              onKeyDown={handleKeyDown}
            />
            <button
              className="bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white p-3 rounded-xl hover:opacity-90 transition-opacity"
              onClick={handleSendClick}
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
    </>
  );
}

export default ChatInterface;
