import React, { useEffect, useState } from "react";
import Navbarchatbot from "./NavbarChatbot";
import Chatbot from "./Chatbot";
import "../styles/Chatbot.css";
import SidebarChatbot from "./SidebarChatbot";
import fetcher from "../../http/RequestConfig";
import ChatbotEdgar from "./chatbot_subcomponents/ChatbotEdgar";
import ChatbotTranslation from "./chatbot_subcomponents/ChatbotTranslation";
import {
  FALLBACK_LOCAL_MODELS,
  getSelectedLocalModel,
  requestLocalModels,
} from "../localModels";
import { useNotifications } from "../../components/Notifications";

function HomeChatbot() {
  const { showError } = useNotifications();
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
  const [localModels, setLocalModels] = useState(FALLBACK_LOCAL_MODELS);

  const activateChat = (chatSummary) => {
    if (!chatSummary) {
      setSelectedChatId(null);
      setCurrChatName("");
      setTicker("");
      setShowChatbot(false);
      setIsEdit(0);
      setConfirmedModelKey("");
      setActiveMessageIndex(null);
      setRelevantChunk("");
      return;
    }

    setSelectedChatId(chatSummary.id);
    setIsPrivate(chatSummary.model_type ?? 0);
    setCurrChatName(chatSummary.chat_name || `Chat ${chatSummary.id}`);
    setcurrTask(chatSummary.associated_task ?? 0);
    setTicker(chatSummary.ticker || "");
    setShowChatbot(chatSummary.associated_task === 1 && Boolean(chatSummary.ticker));
    setIsEdit(0);
    setConfirmedModelKey(chatSummary.custom_model_key || "");
    setActiveMessageIndex(null);
    setRelevantChunk("");
  };

  const handleForceUpdate = () => {
    setForceUpdate((prev) => prev + 1);
  };

  const refreshLocalModels = async () => {
    const localModelState = await requestLocalModels();
    setLocalModels(localModelState.models);
    return localModelState;
  };

  useEffect(() => {
    let isMounted = true;

    const loadInitialState = async () => {
      const [localModelState, chats] = await Promise.all([
        requestLocalModels(),
        fetcher("retrieve-all-chats", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({}),
        })
          .then((response) => response.json())
          .then((responseData) => responseData.chat_info || [])
          .catch((error) => {
            console.error("Error loading most recent chat:", error);
            showError(error.message || "Unable to load your saved chats.", "Chat history unavailable");
            return [];
          }),
      ]);

      if (!isMounted) {
        return;
      }

      setLocalModels(localModelState.models);

      if (chats.length > 0) {
        const mostRecentChat = [...chats].sort((a, b) => b.id - a.id)[0];
        activateChat(mostRecentChat);
        return;
      }

      setIsPrivate(localModelState.defaultModelType);
    };

    loadInitialState();

    return () => {
      isMounted = false;
    };
  }, [showError]);

  const createNewChat = async (
    taskOverride = currTask,
    modelOverride = isPrivate,
    activateSelection = true
  ) => {
    try {
      const response = await fetcher("create-new-chat", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_type: taskOverride, model_type: modelOverride }),
      });
      const responseData = await response.json();
      const chatSummary = {
        id: responseData.chat_id,
        chat_name: responseData.chat_name || `Chat ${responseData.chat_id}`,
        associated_task: taskOverride,
        model_type: modelOverride,
        ticker: "",
        custom_model_key: "",
      };

      if (activateSelection) {
        activateChat(chatSummary);
      }

      return chatSummary;
    } catch (e) {
      console.error("Error creating new chat:", e);
      showError(e.message || "Unable to create a new chat right now.", "Could not create chat");
      return null;
    }
  };

  const selectedLocalModel =
    getSelectedLocalModel(localModels, isPrivate);

  const sharedChatbotProps = {
    selectedChatId,
    handleChatSelect: activateChat,
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
    localModels,
    selectedLocalModel,
    refreshLocalModels,
  };

  return (
    <div className="flex flex-row mt-2 min-h-screen bg-[#0D0F18]">
      {/* Left nav */}
      <div className="w-[20%] px-2">
        <Navbarchatbot
          selectedChatId={selectedChatId}
          onChatSelect={activateChat}
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
          handleChatSelect={activateChat}
          forceUpdate={forceUpdate}
          localModels={localModels}
          selectedLocalModel={selectedLocalModel}
          refreshLocalModels={refreshLocalModels}
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
            createNewChat={createNewChat}
            handleChatSelect={activateChat}
            isPrivate={isPrivate}
            selectedLocalModel={selectedLocalModel}
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
            onChatSelect={activateChat}
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
