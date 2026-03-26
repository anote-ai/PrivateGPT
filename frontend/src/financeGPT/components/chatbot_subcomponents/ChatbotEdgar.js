import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileDownload,
  faPaperPlane,
  faUndoAlt,
  faEye,
  faPen,
  faRobot,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import "../../styles/Chatbot.css";
import fetcher from "../../../http/RequestConfig";
import TypingIndicator from "../TypingIndicator";
import Modal from "../../../components/Modal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ChatbotEdgar = (props) => {
  const [messages, setMessages] = useState([]);
  const [isFirstMessageSent, setIsFirstMessageSent] = useState(false);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [isValidTicker, setIsValidTicker] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const welcomeMessage = (ticker) =>
    ticker
      ? `Hello! I can answer questions about **${ticker}** based on their 10-K filing. How can I help you?`
      : "Hello, I am your financial assistant. Enter a stock ticker above to get started.";

  useEffect(() => {
    handleLoadChat();
    setIsFirstMessageSent(false);
    setMessages([
      { message: welcomeMessage(props.ticker), sentTime: "just now", direction: "incoming" },
    ]);
  }, []);

  useEffect(() => {
    handleLoadChat();
    setIsFirstMessageSent(false);
  }, [props.selectedChatId, props.forceUpdate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  const handleDownload = async () => {
    if (props.selectedChatId === null) return;
    try {
      await fetcher("download-chat-history", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: props.selectedChatId, chat_type: props.chat_type }),
      });
    } catch (e) {
      console.error("Error downloading chat history:", e);
    }
  };

  const togglePopup = (index) => {
    props.setActiveMessageIndex(props.activeMessageIndex === index ? null : index);
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
        headers: { Accept: "application/json", "Content-Type": "application/json" },
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

      if (!isFirstMessageSent) {
        inferChatName(text, answer);
        setIsFirstMessageSent(true);
      }
    } catch (e) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessageId
            ? { ...msg, isTyping: false, message: "Failed to get a response. Please check your model settings.", id: undefined }
            : msg
        )
      );
    }
  };

  const inferChatName = async (text, answer) => {
    try {
      const response = await fetcher("infer-chat-name", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ messages: text.concat(answer), chat_id: props.selectedChatId, model_type: props.isPrivate }),
      });
      const response_data = await response.json();
      props.setCurrChatName(response_data.chat_name);
      props.handleForceUpdate();
    } catch (error) {
      console.error("Error inferring chat name:", error);
    }
  };

  const handleLoadChat = async () => {
    try {
      const response = await fetcher("retrieve-messages-from-chat", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: props.selectedChatId, chat_type: props.chat_type }),
      });

      setMessages([{ message: welcomeMessage(props.ticker), sentTime: "just now", direction: "incoming" }]);

      const response_data = await response.json();
      const transformedMessages = response_data.messages.map((item) => ({
        message: item.message_text,
        direction: item.sent_from_user === 1 ? "outgoing" : "incoming",
        relevant_chunks: item.relevant_chunks,
      }));

      setMessages((prev) => [...prev, ...transformedMessages]);
      setIsFirstMessageSent(transformedMessages.length > 1);
    } catch (error) {
      console.error("Error loading chat messages:", error);
    }
  };

  const resetServer = async () => {
    await fetcher("reset-chat", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: props.selectedChatId, delete_docs: true }),
    });
    props.handleForceUpdate();
  };

  const checkTickerValidity = async (inputTicker) => {
    const response = await fetcher("check-valid-ticker", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: inputTicker }),
    });
    const data = await response.json();
    setIsValidTicker(data.isValid);
  };

  const handleTickerChange = (e) => {
    const inputTicker = e.target.value.toUpperCase();
    props.setTicker(inputTicker);
    checkTickerValidity(inputTicker);
  };

  const processTickerInfo = () => {
    if (props.isEdit) {
      setShowEditModal(true);
    } else if (props.ticker) {
      setMessages([{ message: welcomeMessage(props.ticker), sentTime: "just now", direction: "incoming" }]);
      processTickerBackend(props.ticker);
      addTickerdb(props.ticker, props.isEdit);
      props.setShowChatbot(true);
      props.setIsEdit(0);
    }
  };

  const addTickerdb = async (ticker, isUpdate) => {
    await fetcher("add-ticker-to-chat", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: props.selectedChatId, ticker, isUpdate }),
    });
  };

  const processTickerBackend = async (ticker) => {
    setIsUploading(true);
    try {
      await fetcher("process-ticker-info", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: props.selectedChatId, ticker }),
      });
    } catch (error) {
      console.error("Error processing ticker:", error);
    } finally {
      setIsUploading(false);
      props.handleForceUpdate(true);
    }
  };

  const confirmEditTicker = () => {
    if (props.ticker) {
      setMessages([{ message: welcomeMessage(props.ticker), sentTime: "just now", direction: "incoming" }]);
      processTickerBackend(props.ticker);
      addTickerdb(props.ticker, props.isEdit);
      props.setShowChatbot(true);
      props.setIsEdit(0);
      setShowEditModal(false);
    }
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

  return (
    <div>
      {/* Edit ticker confirmation */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Change Ticker?"
      >
        <p className="text-gray-300 mb-4">
          Changing the ticker will reset your current chat and delete its history. Are you sure?
        </p>
        <div className="flex space-x-3">
          <button
            onClick={confirmEditTicker}
            className="flex-1 py-2 bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white rounded-lg font-semibold hover:opacity-90"
          >
            Yes, change it
          </button>
          <button
            onClick={() => setShowEditModal(false)}
            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Upload splash */}
      {isUploading && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, width: "100%", height: "100%",
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex", flexDirection: "column",
            justifyContent: "center", alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div className="w-12 h-12 border-4 border-[#50B7C3] border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white text-lg font-semibold">Processing 10-K Filing...</p>
          <p className="text-gray-400 text-sm mt-2">This may take a moment</p>
        </div>
      )}

      {/* Ticker Input */}
      <div className="bg-[#12141E] mt-2 px-4 py-3 rounded-xl border border-gray-800">
        <div className="flex flex-row w-full items-center space-x-3">
          <label className="text-gray-400 text-sm font-semibold whitespace-nowrap">
            Stock Ticker
          </label>
          <input
            className="flex-1 disabled:cursor-not-allowed disabled:text-gray-500 text-white rounded-xl bg-[#1E2030] border border-gray-700 focus:border-[#50B7C3] focus:ring-0 px-3 py-2 placeholder:text-gray-600 uppercase font-mono tracking-widest text-sm"
            type="text"
            id="ticker-input"
            placeholder="e.g. AAPL"
            value={props.ticker}
            onChange={handleTickerChange}
            disabled={props.showChatbot === true && props.isEdit === 0}
          />
          {props.showChatbot === true && props.isEdit === 0 ? (
            <button
              className="px-3 py-2 rounded-xl text-gray-400 hover:text-[#50B7C3] hover:bg-gray-800 transition-colors"
              onClick={() => props.setIsEdit(1)}
            >
              <FontAwesomeIcon icon={faPen} />
            </button>
          ) : (
            <button
              onClick={processTickerInfo}
              className="px-4 py-2 rounded-xl font-bold bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white hover:opacity-90 transition-opacity text-sm"
            >
              Load
            </button>
          )}
        </div>
        {props.ticker && (
          <div className="mt-1 text-xs">
            {isValidTicker ? (
              <span className="text-green-400">✓ Valid ticker — ready to load</span>
            ) : (
              <span className="text-red-400">✗ Ticker not found</span>
            )}
          </div>
        )}
      </div>

      {/* Chatbot panel */}
      {props.showChatbot && (
        <div className="min-h-[83vh] h-[83vh] mt-2 relative bg-[#12141E] p-4 w-full rounded-2xl border border-gray-800">
          {props.currChatName ? (
            <>
              {/* Header */}
              <div className="flex flex-row justify-between items-center pb-3 border-b border-gray-700">
                <button
                  onClick={resetServer}
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
                  title="Download history"
                >
                  <FontAwesomeIcon icon={faFileDownload} />
                </button>
              </div>

              {/* Messages */}
              <div className="flex flex-col space-y-3 py-4 h-[63vh] overflow-y-scroll relative pr-1">
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
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.message}
                          </ReactMarkdown>
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

              {/* Input */}
              <div className="absolute bottom-10 left-4 right-4 flex items-end space-x-2">
                <textarea
                  ref={inputRef}
                  rows={1}
                  className="flex-1 rounded-xl bg-[#1E2030] border border-gray-700 focus:border-[#50B7C3] focus:ring-0 text-white placeholder:text-gray-500 px-4 py-3 resize-none overflow-hidden transition-colors text-sm"
                  placeholder="Ask about this company's 10-K filing..."
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
              <p>Create a new chat from left sidebar</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatbotEdgar;
