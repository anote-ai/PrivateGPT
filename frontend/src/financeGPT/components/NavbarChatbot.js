import React, { useEffect, useState } from "react";
import fetcher from "../../http/RequestConfig";
import ChatHistory from "./ChatHistory";
import Modal from "../../components/Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRotateRight,
  faChartLine,
  faDownload,
  faEye,
  faEyeSlash,
  faFile,
  faKey,
  faLanguage,
} from "@fortawesome/free-solid-svg-icons";
import { useNotifications } from "../../components/Notifications";
import LocalModelInstallModal from "./LocalModelInstallModal";
import useLocalModelInstallation from "../hooks/useLocalModelInstallation";

const TASK_TYPES = [
  { id: 0, label: "File Uploader", icon: faFile, description: "Chat with your PDFs" },
  { id: 1, label: "10-K EDGAR", icon: faChartLine, description: "Analyze SEC filings" },
  { id: 2, label: "Translation", icon: faLanguage, description: "AI-powered translation" },
];

function NavbarChatbot(props) {
  const { showError, showSuccess, showInfo } = useNotifications();
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [showConfirmResetKey, setShowConfirmResetKey] = useState(false);
  const [showConfirmModelSwitch, setShowConfirmModelSwitch] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);
  const [pendingModelType, setPendingModelType] = useState(null);
  const [modelKeyInput, setModelKeyInput] = useState("");
  const [showModelKey, setShowModelKey] = useState(false);
  const [isSavingModelKey, setIsSavingModelKey] = useState(false);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const {
    closeInstallationModal,
    installDependencies,
    installError,
    isLoading,
    openInstallationModal,
    progress,
    showInstallationModal,
    timeLeft,
  } = useLocalModelInstallation({
    modelType: props.isPrivate,
    onInstalled: props.refreshLocalModels,
  });

  useEffect(() => {
    setModelKeyInput(props.confirmedModelKey || "");
    setShowModelKey(false);
  }, [props.confirmedModelKey, props.selectedChatId]);

  const maskModelKey = (key) => {
    if (!key) {
      return "Not set";
    }

    if (key.length <= 8) {
      return "*".repeat(key.length);
    }

    return `${key.slice(0, 4)}${"*".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
  };

  const handleTaskChange = (taskId) => {
    if (taskId !== props.currTask) {
      setPendingTask(taskId);
      setShowConfirmPopup(true);
    }
  };

  const confirmSwitchChange = async () => {
    if (pendingTask === null) return;

    try {
      const chat = await props.createNewChat(pendingTask, props.isPrivate);
      if (!chat) {
        throw new Error("Unable to create a new chat for the selected task.");
      }

      showInfo("A fresh chat was created for the new task.", "Task switched");
      setShowConfirmPopup(false);
      setPendingTask(null);
    } catch (error) {
      console.error("Error switching task:", error);
      showError(error.message || "Unable to switch tasks right now.", "Task switch failed");
    }
  };

  const confirmResetModel = async () => {
    try {
      await addModelKeyToDb(null, props.selectedChatId);
      props.setConfirmedModelKey("");
      setModelKeyInput("");
      showSuccess(
        "This chat will stop using the saved OpenAI key and fall back to the local model or backend default key.",
        "Model key removed"
      );
      setShowConfirmResetKey(false);
    } catch (error) {
      console.error("Error clearing model key:", error);
      showError(error.message || "Unable to remove the model key right now.", "Remove failed");
    }
  };

  const addModelKeyToDb = async (model_key_db, chatId = props.selectedChatId) => {
    await fetcher("add-model-key", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, model_key: model_key_db }),
    });
    props.handleForceUpdate();
  };

  const ensureSettingsChat = async () => {
    if (props.selectedChatId !== null && props.selectedChatId !== undefined) {
      return props.selectedChatId;
    }

    const chat = await props.createNewChat(props.currTask, props.isPrivate, true);
    if (!chat?.id) {
      throw new Error("Unable to create a chat for saving this key.");
    }

    return chat.id;
  };

  const handleSaveModelKey = async () => {
    const trimmedKey = modelKeyInput.trim();

    if (!trimmedKey) {
      showError("Enter an OpenAI API key before saving.", "API key required");
      return;
    }

    setIsSavingModelKey(true);
    try {
      const chatId = await ensureSettingsChat();
      await addModelKeyToDb(trimmedKey, chatId);
      props.setConfirmedModelKey(trimmedKey);
      showSuccess(
        "OpenAI is now enabled for this chat. Future responses can use your saved key.",
        "Model key saved"
      );
    } catch (error) {
      console.error("Error saving model key:", error);
      showError(error.message || "Unable to save the model key right now.", "Save failed");
    } finally {
      setIsSavingModelKey(false);
    }
  };

  const handleRefreshModels = async () => {
    setIsRefreshingModels(true);
    try {
      await props.refreshLocalModels();
      showSuccess("Local model availability was refreshed.", "Status updated");
    } catch (error) {
      console.error("Error refreshing local models:", error);
      showError(error.message || "Unable to refresh local model availability.", "Refresh failed");
    } finally {
      setIsRefreshingModels(false);
    }
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
      const nextModel = props.localModels.find((model) => model.id === pendingModelType);
      showSuccess(`Switched this chat to ${nextModel?.label || "the selected model"}.`, "Model updated");
    } catch (e) {
      console.error("Error switching model:", e);
      showError(e.message || "Unable to switch the local model for this chat.", "Model switch failed");
    } finally {
      setPendingModelType(null);
      setShowConfirmModelSwitch(false);
    }
  };

  const changeChatMode = async (isPrivate) => {
    await fetcher("change-chat-mode", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: props.selectedChatId, model_type: isPrivate }),
    });
  };

  const selectedModelName = props.selectedLocalModel?.label || "Selected Model";
  const hasConfirmedModelKey = Boolean(props.confirmedModelKey);

  return (
    <>
      <LocalModelInstallModal
        isOpen={showInstallationModal}
        onClose={closeInstallationModal}
        isLoading={isLoading}
        progress={progress}
        timeLeft={timeLeft}
        error={installError}
        modelName={selectedModelName}
        onInstall={installDependencies}
      />

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

      {/* Confirm remove model key */}
      <Modal
        isOpen={showConfirmResetKey}
        onClose={() => setShowConfirmResetKey(false)}
        title="Remove OpenAI Key?"
      >
        <p className="text-gray-300 mb-4">
          This removes the saved OpenAI key from the current chat. Existing messages stay as-is, but future responses will stop using that key.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={confirmResetModel}
            className="flex-1 py-2 bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white rounded-lg font-semibold hover:opacity-90"
          >
            Remove key
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
            <div className="mt-3 rounded-xl border border-gray-800 bg-[#171A26] px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{props.selectedLocalModel?.label}</p>
                  <p className="text-xs text-gray-400">{props.selectedLocalModel?.description}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    props.selectedLocalModel?.installed
                      ? "bg-emerald-500/15 text-emerald-300"
                      : props.selectedLocalModel?.chat_model_installed
                        ? "bg-sky-500/15 text-sky-300"
                        : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {props.selectedLocalModel?.installed
                    ? "Ready"
                    : props.selectedLocalModel?.chat_model_installed
                      ? "Needs setup"
                      : "Not installed"}
                </span>
              </div>
              {!props.selectedLocalModel?.installed && props.selectedLocalModel?.chat_model_installed && (
                <p className="mt-2 text-xs text-sky-300">
                  The chat model is present, but document workflows still need the local embedding model.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {!props.selectedLocalModel?.installed && (
                  <button
                    type="button"
                    onClick={() => openInstallationModal()}
                    className="flex-1 rounded-lg bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    <FontAwesomeIcon icon={faDownload} className="mr-2" />
                    Install model
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  disabled={isRefreshingModels}
                  className={`rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 ${
                    props.selectedLocalModel?.installed ? "flex-1" : ""
                  } ${isRefreshingModels ? "opacity-60 cursor-not-allowed" : "hover:border-[#50B7C3] hover:text-white"}`}
                >
                  <FontAwesomeIcon icon={faArrowRotateRight} className="mr-2" />
                  {isRefreshingModels ? "Refreshing..." : "Refresh status"}
                </button>
              </div>
            </div>

            <div className="mt-3 border-t border-gray-800 pt-3">
              <div className="flex items-start justify-between gap-3 px-1">
                <div>
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faKey} className="text-[#50B7C3] text-xs" />
                    <span className="text-sm font-medium text-gray-200">OpenAI API Key</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Optional. Save a key for this chat to use OpenAI responses and translation when you do not want to rely only on local models.
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    hasConfirmedModelKey
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {hasConfirmedModelKey ? "Saved to chat" : "Not set"}
                </span>
              </div>

              <p className="mt-3 px-1 text-xs text-gray-500">
                Current key: <span className="font-mono text-gray-400">{maskModelKey(props.confirmedModelKey)}</span>
              </p>

              <div className="relative mt-3">
                <input
                  type={showModelKey ? "text" : "password"}
                  value={modelKeyInput}
                  onChange={(event) => setModelKeyInput(event.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-gray-700 bg-[#1E2030] px-3 py-2 pr-10 text-sm text-white placeholder:text-gray-500 focus:border-[#50B7C3] focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setShowModelKey((current) => !current)}
                  className="absolute inset-y-0 right-2 text-gray-400 hover:text-white"
                  title={showModelKey ? "Hide key" : "Show key"}
                >
                  <FontAwesomeIcon icon={showModelKey ? faEyeSlash : faEye} />
                </button>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveModelKey}
                  disabled={!modelKeyInput.trim() || isSavingModelKey}
                  className={`flex-1 rounded-lg bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] px-3 py-2 text-xs font-semibold text-white ${
                    !modelKeyInput.trim() || isSavingModelKey ? "cursor-not-allowed opacity-60" : "hover:opacity-90"
                  }`}
                >
                  {isSavingModelKey ? "Saving..." : hasConfirmedModelKey ? "Update key" : "Save key"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmResetKey(true)}
                  disabled={!hasConfirmedModelKey}
                  className={`rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 ${
                    hasConfirmedModelKey ? "hover:border-red-400 hover:text-red-200" : "cursor-not-allowed opacity-50"
                  }`}
                >
                  Remove key
                </button>
              </div>

              <p className="mt-2 px-1 text-xs text-gray-500">
                If no chat is selected yet, saving a key here will create a new chat for the current task automatically.
              </p>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}

export default NavbarChatbot;
