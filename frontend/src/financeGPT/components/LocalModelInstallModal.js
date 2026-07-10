import React from "react";
import Modal from "../../components/Modal";

function LocalModelInstallModal({
  error,
  isLoading,
  isOpen,
  modelName,
  onClose,
  onInstall,
  progress,
  timeLeft,
}) {
  const title = isLoading ? "Installing Model..." : `Install ${modelName}`;
  const isOllamaMissing = typeof error === "string" && error.includes("Ollama CLI not found");
  const bodyText = error
    ? (isOllamaMissing
      ? "Local model downloads run on your machine through Ollama. Install Ollama first, then retry here."
      : error)
    : `You have not installed ${modelName}. This setup also installs the local embedding model needed for PDF upload and ticker analysis.`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
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
        <p className={`mb-4 ${error ? "text-red-400" : "text-gray-300"}`}>{bodyText}</p>
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
  );
}

export default LocalModelInstallModal;
