import React, { useState } from "react";
import Navbarchatbot from "./NavbarChatbot";
import Chatbot from "./Chatbot";
import "../styles/Chatbot.css";
import SidebarChatbot from "./SidebarChatbot";
import fetcher from "../../http/RequestConfig";
import ChatbotEdgar from "./chatbot_subcomponents/ChatbotEdgar";
import ChatbotTranslation from "./chatbot_subcomponents/ChatbotTranslation";

function HomeChatbot() {
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [isPrivate, setIsPrivate] = useState(0);
  const [currChatName, setCurrChatName] = useState("");
  const [currTask, setcurrTask] = useState(0); // 0=File Upload, 1=EDGAR, 2=Translation
  const [ticker, setTicker] = useState("");
  const [showChatbot, setShowChatbot] = useState(false);
  const [isEdit, setIsEdit] = useState(0);
  const [activeMessageIndex, setActiveMessageIndex] = useState(null);
  const [relevantChunk, setRelevantChunk] = useState("");
  const [confirmedModelKey, setConfirmedModelKey] = useState("");

  const handleChatSelect = (chatId) => {
    setSelectedChatId(chatId);
  };

  const handleForceUpdate = () => {
    setForceUpdate((prev) => prev + 1);
  };

  const createNewChat = async () => {
    try {
      const response = await fetcher("create-new-chat", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_type: currTask, model_type: isPrivate }),
      });
      const response_data = await response.json();
      handleChatSelect(response_data.chat_id);
      return response_data.chat_id;
    } catch (e) {
      console.error("Error creating new chat:", e);
    }
  };

  const sharedChatbotProps = {
    selectedChatId,
    handleChatSelect,
    handleForceUpdate,
    forceUpdate,
    isPrivate,
    currChatName,
    confirmedModelKey,
    setCurrChatName,
    activeMessageIndex,
    setActiveMessageIndex,
    setRelevantChunk,
    createNewChat,
  };

  return (
    <div className="flex flex-row mt-2 min-h-screen bg-[#0D0F18]">
      {/* Left nav */}
      <div className="w-[20%] px-2">
        <Navbarchatbot
          selectedChatId={selectedChatId}
          onChatSelect={handleChatSelect}
          handleForceUpdate={handleForceUpdate}
          isPrivate={isPrivate}
          setIsPrivate={setIsPrivate}
          setcurrTask={setcurrTask}
          setTicker={setTicker}
          currTask={currTask}
          setConfirmedModelKey={setConfirmedModelKey}
          confirmedModelKey={confirmedModelKey}
          setCurrChatName={setCurrChatName}
          setIsEdit={setIsEdit}
          setShowChatbot={setShowChatbot}
          createNewChat={createNewChat}
          handleChatSelect={handleChatSelect}
          forceUpdate={forceUpdate}
        />
      </div>

      {/* Main content */}
      <div className="w-[60%] mx-2">
        {currTask === 0 && (
          <Chatbot
            chat_type={currTask}
            {...sharedChatbotProps}
          />
        )}
        {currTask === 1 && (
          <ChatbotEdgar
            chat_type={currTask}
            ticker={ticker}
            setTicker={setTicker}
            showChatbot={showChatbot}
            setShowChatbot={setShowChatbot}
            isEdit={isEdit}
            setIsEdit={setIsEdit}
            {...sharedChatbotProps}
          />
        )}
        {currTask === 2 && (
          <ChatbotTranslation
            selectedChatId={selectedChatId}
            confirmedModelKey={confirmedModelKey}
          />
        )}
      </div>

      {/* Right sidebar — hide for translation mode */}
      {currTask !== 2 && (
        <div className="w-[20%] mt-2 px-2">
          <SidebarChatbot
            selectedChatId={selectedChatId}
            chat_type={currTask}
            createNewChat={createNewChat}
            onChatSelect={handleChatSelect}
            handleForceUpdate={handleForceUpdate}
            forceUpdate={forceUpdate}
            setIsPrivate={setIsPrivate}
            setCurrChatName={setCurrChatName}
            setcurrTask={setcurrTask}
            setTicker={setTicker}
            setShowChatbot={setShowChatbot}
            setIsEdit={setIsEdit}
            setConfirmedModelKey={setConfirmedModelKey}
            relevantChunk={relevantChunk}
            activeMessageIndex={activeMessageIndex}
          />
        </div>
      )}
    </div>
  );
}

export default HomeChatbot;
