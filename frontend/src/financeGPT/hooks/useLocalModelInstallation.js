import { useEffect, useRef, useState } from "react";
import { installLocalModel, requestLocalModelStatus } from "../localModels";
import { useNotifications } from "../../components/Notifications";

const POLL_INTERVAL_MS = 3000;

function useLocalModelInstallation({ modelType, onInstalled }) {
  const { showError, showInfo, showSuccess } = useNotifications();
  const [showInstallationModal, setShowInstallationModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");
  const [installError, setInstallError] = useState("");
  const installPollTimeoutRef = useRef(null);

  const normalizeInstallError = (value) => {
    if (typeof value === "string") {
      return value.trim();
    }

    if (value instanceof Error && typeof value.message === "string") {
      return value.message.trim();
    }

    if (value && typeof value === "object" && typeof value.message === "string") {
      return value.message.trim();
    }

    return "";
  };

  const clearPendingPoll = () => {
    if (installPollTimeoutRef.current) {
      clearTimeout(installPollTimeoutRef.current);
      installPollTimeoutRef.current = null;
    }
  };

  const refreshInstalledModels = async () => {
    if (typeof onInstalled === "function") {
      await onInstalled();
    }
  };

  const resetInstallState = ({ keepModalOpen = false } = {}) => {
    setIsLoading(false);
    setProgress(0);
    setTimeLeft("");
    clearPendingPoll();

    if (!keepModalOpen) {
      setShowInstallationModal(false);
    }
  };

  const closeInstallationModal = () => {
    setInstallError("");
    resetInstallState();
  };

  const openInstallationModal = (errorMessage = "") => {
    setInstallError(normalizeInstallError(errorMessage));
    setShowInstallationModal(true);
  };

  const pollInstallationStatus = async () => {
    try {
      const status = await requestLocalModelStatus(modelType);

      if (status.error) {
        setInstallError(status.error);
        resetInstallState({ keepModalOpen: true });
        return;
      }

      if (
        status.model?.installed ||
        status.progress === 100 ||
        (!status.running && status.completed)
      ) {
        setInstallError("");
        resetInstallState();
        await refreshInstalledModels();
        showSuccess(`${status.model?.label || "The selected model"} is ready to use.`, "Model installed");
        return;
      }

      setTimeLeft(status.time_left || "Calculating...");
      setProgress(status.progress || 0);
      installPollTimeoutRef.current = setTimeout(pollInstallationStatus, POLL_INTERVAL_MS);
    } catch (error) {
      console.error("Failed to fetch install status:", error);
      setInstallError(error.message || "Unable to check installation progress. Please verify Ollama is running.");
      resetInstallState({ keepModalOpen: true });
      showError(error.message || "Unable to check installation progress. Please verify Ollama is running.", "Install status failed");
    }
  };

  const installDependencies = async () => {
    setInstallError("");
    setProgress(0);
    setTimeLeft("Preparing download...");
    setIsLoading(true);

    try {
      const responseData = await installLocalModel(modelType);

      if (responseData.already_installed) {
        resetInstallState();
        await refreshInstalledModels();
        return;
      }

      if (!responseData.success) {
        setInstallError(responseData.message || "Failed to start the local model download.");
        resetInstallState({ keepModalOpen: true });
        return;
      }

      showInfo(`Downloading ${responseData.model?.label || "the selected model"} in the background.`, "Installation started");
      await pollInstallationStatus();
    } catch (error) {
      console.error("Installation failed:", error);
      setInstallError(
        error.message || "Installation failed. Please make sure Ollama is installed, then try again."
      );
      resetInstallState({ keepModalOpen: true });
      showError(
        error.message || "Installation failed. Please make sure Ollama is installed, then try again.",
        "Installation failed"
      );
    }
  };

  useEffect(() => () => {
    clearPendingPoll();
  }, []);

  return {
    showInstallationModal,
    isLoading,
    progress,
    timeLeft,
    installError,
    openInstallationModal,
    closeInstallationModal,
    installDependencies,
  };
}

export default useLocalModelInstallation;
