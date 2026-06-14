import React, { useState, useEffect } from "react";
import fetcher from "../../http/RequestConfig";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan, faFileAlt } from "@fortawesome/free-solid-svg-icons";
import Sources from "./Sources";
import Modal from "../../components/Modal";

function SidebarChatbot(props) {
  const [docs, setDocs] = useState([]);
  const [showConfirmPopupDoc, setShowConfirmPopupDoc] = useState(false);
  const [docToDeleteName, setDocToDeleteName] = useState(null);
  const [docToDeleteId, setDocToDeleteId] = useState(null);

  useEffect(() => {
    retrieveDocs();
  }, [props.selectedChatId, props.forceUpdate]);

  const handleDeleteDoc = (doc_name, doc_id) => {
    setDocToDeleteName(doc_name);
    setDocToDeleteId(doc_id);
    setShowConfirmPopupDoc(true);
  };

  const confirmDeleteDoc = () => {
    deleteDoc(docToDeleteId);
    setShowConfirmPopupDoc(false);
  };

  const retrieveDocs = async () => {
    try {
      const response = await fetcher("retrieve-current-docs", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: props.selectedChatId }),
      });
      const response_data = await response.json();
      setDocs(response_data.doc_info);
    } catch (e) {
      console.error("Error retrieving docs:", e);
    }
  };

  const deleteDoc = async (doc_id) => {
    try {
      await fetcher("delete-doc", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id }),
      });
      props.handleForceUpdate();
    } catch (e) {
      console.error("Error deleting doc:", e);
    }
  };

  return (
    <>
      {/* Delete doc confirmation */}
      <Modal
        isOpen={showConfirmPopupDoc}
        onClose={() => setShowConfirmPopupDoc(false)}
        title="Delete Document?"
      >
        <p className="text-gray-300 mb-1">
          Delete <span className="font-semibold text-white">"{docToDeleteName}"</span>?
        </p>
        <p className="text-gray-500 text-sm mb-4">
          This will also remove all associated chunks.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={confirmDeleteDoc}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-500 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => setShowConfirmPopupDoc(false)}
            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Documents panel */}
      <div className="bg-[#12141E] rounded-xl p-3 border border-gray-800 text-white max-h-[40vh] flex flex-col">
        <h2 className="text-gray-500 uppercase tracking-wide font-semibold text-xs mb-2 px-1">
          Uploaded Files
        </h2>
        <div className="overflow-y-auto flex-1">
          {docs.length === 0 && (
            <p className="text-gray-600 text-xs text-center py-4">No documents uploaded</p>
          )}
          {docs.map((doc) => (
            <div
              key={doc.document_name}
              className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-[#1E2030] group transition-colors"
            >
              <div className="flex items-center space-x-2 min-w-0">
                <FontAwesomeIcon icon={faFileAlt} className="text-[#50B7C3] text-xs flex-shrink-0" />
                <span className="text-gray-300 text-xs truncate">{doc.document_name}</span>
              </div>
              <button
                onClick={() => handleDeleteDoc(doc.document_name, doc.id)}
                className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sources panel */}
      <div className="mt-2">
        <Sources
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
          relevantChunk={props.relevantChunk}
          activeMessageIndex={props.activeMessageIndex}
        />
      </div>
    </>
  );
}

export default SidebarChatbot;
