import React from "react";
import Modal from "../../components/Modal";

function normalizeErrorText(error) {
  if (typeof error === "string") {
    return error.trim();
  }

  if (error instanceof Error && typeof error.message === "string") {
    return error.message.trim();
  }

  if (error && typeof error === "object" && typeof error.message === "string") {
    return error.message.trim();
  }

  return "";
}

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
  const normalizedError = normalizeErrorText(error);
  const title = isLoading ? "Installing Model..." : `Install ${modelName}`;
  const isOllamaMissing = normalizedError.includes("Ollama CLI not found");
  const bodyText = normalizedError
    ? (isOllamaMissing
      ? "Local model downloads run on your machine through Ollama. Install Ollama first, then retry here."
      : normalizedError)
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
        <div className="mb-4">
          <p className={normalizedError ? "text-red-400" : "text-gray-300"}>{bodyText}</p>
          {isOllamaMissing && (
            <a
              className="mt-3 inline-flex text-sm font-medium text-[#50B7C3] hover:text-white"
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
            >
              Open Ollama download page
            </a>
          )}
        </div>
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
