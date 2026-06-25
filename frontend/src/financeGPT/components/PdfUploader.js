import React, { useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileUpload } from "@fortawesome/free-solid-svg-icons";
import fetcher from "../../http/RequestConfig";
import { useNotifications } from "../../components/Notifications";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function PDFUploader({ chat_id, handleForceUpdate }) {
  const { showError, showSuccess } = useNotifications();
  const [file, setFile] = useState();
  const [numPages, setNumPages] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef();

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

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

    for (let i = 0; i < files.length; i++) {
      formData.append("files[]", files[i]);
    }

    await fetcher(uploadUrl, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
    });
  };

  const uploadFile = async (e) => {
    const files = e.target.files;
    if (!files?.length || !chat_id) {
      return;
    }

    setFile(files);
    setIsUploading(true);

    try {
      const uploadUrl = await uploadMetadata(chat_id);
      if (!uploadUrl) {
        throw new Error("Missing upload URL from the server.");
      }

      await uploadFiles(files, uploadUrl);
      handleForceUpdate?.();
      showSuccess(`${files.length} file${files.length > 1 ? "s were" : " was"} uploaded successfully.`, "Upload complete");
    } catch (error) {
      console.error("Error during file upload", error);
      showError(error.message || "We couldn't upload that PDF. Please try again.", "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadBtnClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div>
      {isUploading && (
        <div style={splashScreenStyle}>Processing Document...</div>
      )}
      <input
        type="file"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={uploadFile}
        accept=".pdf"
        multiple // Allow multiple file selection
      />
      <div className="">
        <FontAwesomeIcon
          icon={faFileUpload}
          onClick={handleUploadBtnClick}
          className="px-2"
        />
      </div>
      <div>
        {file && (
          <div>
            {Array.from(file).map((singleFile, fileIndex) => (
              <Document
                key={`file_${fileIndex}`}
                file={singleFile}
                onLoadSuccess={onDocumentLoadSuccess}
              >
                {Array.from(new Array(numPages), (el, pageIndex) => (
                  <Page
                    key={`page_${fileIndex}_${pageIndex + 1}`}
                    pageNumber={pageIndex + 1}
                  />
                ))}
              </Document>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default PDFUploader;
