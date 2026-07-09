import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileUpload, faTrashCan, faXmark } from "@fortawesome/free-solid-svg-icons";
import fetcher from "../../http/RequestConfig";
import { useNotifications } from "../../components/Notifications";

function formatFileSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes <= 0) {
    return "0 KB";
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeInBytes / 1024))} KB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PDFUploader({ chat_id, handleForceUpdate }) {
  const { showError, showSuccess } = useNotifications();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const splashScreenStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "1.5rem",
    color: "white",
    zIndex: 1000,
  };

  const resetSelection = () => {
    setSelectedFiles([]);
    setIsPanelOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadMetadata = async (chatId) => {
    const response = await fetcher("ingest-metadata", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
    });

    const result = await response.json();
    return result.uploadUrl;
  };

  const uploadFiles = async (files, uploadUrl) => {
    const formData = new FormData();

    files.forEach((fileItem) => {
      formData.append("files[]", fileItem);
    });

    await fetcher(uploadUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });
  };

  const handleFileSelection = (event) => {
    const files = Array.from(event.target.files || []);
    const invalidFile = files.find((file) => !file.name.toLowerCase().endsWith(".pdf"));

    if (invalidFile) {
      showError("Only PDF files can be uploaded right now.", "Unsupported file");
      resetSelection();
      return;
    }

    if (!files.length) {
      resetSelection();
      return;
    }

    setSelectedFiles(files);
    setIsPanelOpen(true);
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) {
      return;
    }

    if (!chat_id) {
      showError("Create or select a chat before uploading documents.", "Chat required");
      return;
    }

    setIsUploading(true);

    try {
      const uploadUrl = await uploadMetadata(chat_id);
      if (!uploadUrl) {
        throw new Error("Missing upload URL from the server.");
      }

      await uploadFiles(selectedFiles, uploadUrl);
      handleForceUpdate?.();
      showSuccess(
        `${selectedFiles.length} file${selectedFiles.length > 1 ? "s were" : " was"} uploaded successfully.`,
        "Upload complete"
      );
      resetSelection();
    } catch (error) {
      console.error("Error during file upload", error);
      showError(
        error.message || "We couldn't upload that PDF. Please try again.",
        "Upload failed"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadBtnClick = () => {
    if (!chat_id) {
      showError("Create or select a chat before choosing a PDF.", "Chat required");
      return;
    }

    fileInputRef.current?.click();
  };

  const removeSelectedFile = (indexToRemove) => {
    setSelectedFiles((currentFiles) => {
      const updatedFiles = currentFiles.filter((_, index) => index !== indexToRemove);

      if (!updatedFiles.length && fileInputRef.current) {
        fileInputRef.current.value = "";
        setIsPanelOpen(false);
      }

      return updatedFiles;
    });
  };

  const totalSelectedSize = selectedFiles.reduce((total, file) => total + (file.size || 0), 0);

  return (
    <div className="relative">
      {isUploading && (
        <div style={splashScreenStyle}>Processing Document...</div>
      )}

      <input
        type="file"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleFileSelection}
        accept=".pdf,application/pdf"
        multiple
      />

      <button
        type="button"
        onClick={handleUploadBtnClick}
        className="text-gray-300 transition-colors hover:text-[#50B7C3]"
        title="Choose PDF files"
      >
        <FontAwesomeIcon icon={faFileUpload} className="px-1" />
      </button>

      {isPanelOpen && selectedFiles.length > 0 && (
        <div className="absolute bottom-full left-0 z-50 mb-3 w-80 max-w-[70vw] rounded-2xl border border-gray-700 bg-[#171A26] p-3 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Ready to upload</p>
              <p className="text-xs text-gray-400">
                {selectedFiles.length} PDF{selectedFiles.length > 1 ? "s" : ""} selected
                {" · "}
                {formatFileSize(totalSelectedSize)}
              </p>
            </div>
            <button
              type="button"
              onClick={resetSelection}
              disabled={isUploading}
              className="rounded-full px-2 py-1 text-xs text-gray-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              title="Clear selection"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
            {selectedFiles.map((singleFile, index) => (
              <div
                key={`${singleFile.name}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-[#1E2030] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{singleFile.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(singleFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeSelectedFile(index)}
                  disabled={isUploading}
                  className="rounded-full p-1 text-gray-500 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                  title="Remove file"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={resetSelection}
              disabled={isUploading}
              className="flex-1 rounded-xl border border-gray-700 px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || !selectedFiles.length}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PDFUploader;
