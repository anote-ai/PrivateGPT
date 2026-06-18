import React, { useState } from "react";
import fetcher from "../../http/RequestConfig";
import ChatHistory from "./ChatHistory";
import Modal from "../../components/Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile, faChartLine, faLanguage } from "@fortawesome/free-solid-svg-icons";

const TASK_TYPES = [
  { id: 0, label: "File Uploader", icon: faFile, description: "Chat with your PDFs" },
  { id: 1, label: "10-K EDGAR", icon: faChartLine, description: "Analyze SEC filings" },
  { id: 2, label: "Translation", icon: faLanguage, description: "AI-powered translation" },
];

function NavbarChatbot(props) {
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [showErrorKeyMessage, setShowErrorKeyMessage] = useState(false);
  const [showConfirmResetKey, setShowConfirmResetKey] = useState(false);
  const [showConfirmModelSwitch, setShowConfirmModelSwitch] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);
  const [pendingModelType, setPendingModelType] = useState(null);

  const handleTaskChange = (taskId) => {
    if (taskId !== props.currTask) {
      setPendingTask(taskId);
      setShowConfirmPopup(true);
    }
  };

  const confirmSwitchChange = async () => {
    if (pendingTask === null) return;

    await props.createNewChat(pendingTask, props.isPrivate);
    setShowConfirmPopup(false);
    setPendingTask(null);
  };

  const confirmResetModel = () => {
    resetChat();
    addModelKeyToDb(null);
    props.setConfirmedModelKey("");
    setShowConfirmResetKey(false);
  };

  const addModelKeyToDb = async (model_key_db) => {
    await fetcher("add-model-key", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: props.selectedChatId, model_key: model_key_db }),
    });
    props.handleForceUpdate();
  };

  const resetChat = async () => {
    await fetcher("reset-chat", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: props.selectedChatId }),
    });
    props.handleForceUpdate();
  };

  const handleModelChange = (value) => {
    const nextModelType = Number(value);

    if (Number.isNaN(nextModelType) || nextModelType === props.isPrivate) {
      return;
    }

    if (props.selectedChatId === null) {
      props.setIsPrivate(nextModelType);
      return;
    }

    setPendingModelType(nextModelType);
    setShowConfirmModelSwitch(true);
  };

  const confirmModelSwitch = async () => {
    if (pendingModelType === null) return;

    try {
      await changeChatMode(pendingModelType);
      props.setIsPrivate(pendingModelType);
      props.handleForceUpdate();
    } catch (e) {
      console.error("Error switching model:", e);
    } finally {
      setPendingModelType(null);
      setShowConfirmModelSwitch(false);
    }
  };

  const changeChatMode = async (isPrivate) => {
    try {
      await fetcher("change-chat-mode", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: props.selectedChatId, model_type: isPrivate }),
      });
    } catch (e) {
      console.error("Error changing chat mode:", e);
    }
  };

  return (
    <>
      {/* Confirm task switch modal */}
      <Modal
        isOpen={showConfirmPopup}
        onClose={() => setShowConfirmPopup(false)}
        title="Switch Task?"
      >
        <p className="text-gray-300 mb-4">
          Switching tasks will start a new chat so your current conversation stays intact.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={confirmSwitchChange}
            className="flex-1 py-2 bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white rounded-lg font-semibold hover:opacity-90"
          >
            Start new chat
          </button>
          <button
            onClick={() => setShowConfirmPopup(false)}
            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={showConfirmModelSwitch}
        onClose={() => setShowConfirmModelSwitch(false)}
        title="Switch Local Model?"
      >
        <p className="text-gray-300 mb-4">
          Changing the local model will reset the current chat history but keep the attached documents and ticker.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={confirmModelSwitch}
            className="flex-1 py-2 bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white rounded-lg font-semibold hover:opacity-90"
          >
            Switch model
          </button>
          <button
            onClick={() => setShowConfirmModelSwitch(false)}
            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Error: can't add model key in private mode */}
      <Modal
        isOpen={showErrorKeyMessage}
        onClose={() => setShowErrorKeyMessage(false)}
        title="Not Available"
      >
        <p className="text-gray-300 mb-4">
          You cannot add an OpenAI model key while in private mode.
        </p>
        <button
          onClick={() => setShowErrorKeyMessage(false)}
          className="w-full py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
        >
          Close
        </button>
      </Modal>

      {/* Confirm reset model key */}
      <Modal
        isOpen={showConfirmResetKey}
        onClose={() => setShowConfirmResetKey(false)}
        title="Reset Model Key?"
      >
        <p className="text-gray-300 mb-4">
          This will reset your OpenAI key and clear your current chat history.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={confirmResetModel}
            className="flex-1 py-2 bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white rounded-lg font-semibold hover:opacity-90"
          >
            Reset
          </button>
          <button
            onClick={() => setShowConfirmResetKey(false)}
            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </Modal>

      <nav className="flex flex-col h-screen text-white">
        <div className="flex-1 overflow-y-auto flex flex-col space-y-2">
          {/* Task Types */}
          <div className="bg-[#12141E] rounded-xl p-3 border border-gray-800">
            <h2 className="text-gray-500 uppercase tracking-wide font-semibold text-xs mb-3 px-1">
              Task Type
            </h2>
            <ul className="space-y-1">
              {TASK_TYPES.map((task) => (
                <li key={task.id}>
                  <button
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      props.currTask === task.id
                        ? "bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white"
                        : "text-gray-300 hover:bg-[#1E2030] hover:text-white"
                    }`}
                    onClick={() => handleTaskChange(task.id)}
                  >
                    <FontAwesomeIcon icon={task.icon} className="w-4" />
                    <span>{task.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Chat History */}
          <ChatHistory
            onChatSelect={props.onChatSelect}
            setIsPrivate={props.setIsPrivate}
            setTicker={props.setTicker}
            setConfirmedModelKey={props.setConfirmedModelKey}
            setcurrTask={props.setcurrTask}
            setCurrChatName={props.setCurrChatName}
            setIsEdit={props.setIsEdit}
            setShowChatbot={props.setShowChatbot}
            handleForceUpdate={props.handleForceUpdate}
            createNewChat={props.createNewChat}
            selectedChatId={props.selectedChatId}
            handleChatSelect={props.handleChatSelect}
            forceUpdate={props.forceUpdate}
          />

          {/* Settings */}
          <div className="bg-[#12141E] rounded-xl p-3 border border-gray-800">
            <h2 className="text-gray-500 uppercase tracking-wide font-semibold text-xs mb-3 px-1">
              Settings
            </h2>
            <div className="flex items-center justify-between px-1">
              <span className="text-gray-300 text-sm font-medium">Local Model</span>
              <select
                className="bg-[#1E2030] rounded-lg border border-gray-700 focus:ring-0 focus:border-[#50B7C3] text-white text-sm cursor-pointer px-2 py-1.5"
                onChange={(e) => handleModelChange(e.target.value)}
                value={String(props.isPrivate)}
              >
                {props.localModels.map((model) => (
                  <option key={model.id} value={String(model.id)}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}

export default NavbarChatbot;
