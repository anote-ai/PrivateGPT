import React, { useState, useEffect } from "react";
import fetcher from "../../http/RequestConfig";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faPenToSquare, faTrashCan, faCommentDots } from "@fortawesome/free-solid-svg-icons";
import Modal from "../../components/Modal";

function ChatHistory(props) {
  const [chats, setChats] = useState([]);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [showConfirmPopupChat, setShowConfirmPopupChat] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [chatIdToRename, setChatIdToRename] = useState(null);
  const [newChatName, setNewChatName] = useState("");

  useEffect(() => {
    retrieveAllChats();
  }, [props.selectedChatId, props.forceUpdate]);

  const handleDeleteChat = (chat_id) => {
    setChatToDelete(chat_id);
    setShowConfirmPopupChat(true);
  };

  const confirmDeleteChat = () => {
    deleteChat(chatToDelete);
    setShowConfirmPopupChat(false);
    props.onChatSelect(null);
  };

  const handleRenameChat = (chat_id) => {
    setChatIdToRename(chat_id);
    setNewChatName("");
    setShowRenameModal(true);
  };

  const confirmRenameChat = () => {
    renameChat(chatIdToRename, newChatName);
    setShowRenameModal(false);
  };

  const retrieveAllChats = async () => {
    try {
      const response = await fetcher("retrieve-all-chats", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_type: props.chat_type }),
      });
      const response_data = await response.json();
      setChats(response_data.chat_info);
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  const deleteChat = async (chat_id) => {
    try {
      const response = await fetcher("delete-chat", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id }),
      });
      if (response.ok) {
        props.handleForceUpdate();
        try {
          const recentRes = await fetcher("find-most-recent-chat", {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const recentData = await recentRes.json();
          props.handleChatSelect(recentData.chat_info.id);
          props.setCurrChatName(recentData.chat_info.chat_name);
        } catch (e) {
          console.error("Error finding recent chat after deletion", e);
        }
      }
    } catch (e) {
      console.error("Error deleting chat:", e);
    }
  };

  const renameChat = async (chat_id, new_name) => {
    try {
      await fetcher("update-chat-name", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, chat_name: new_name }),
      });
      retrieveAllChats();
    } catch (e) {
      console.error("Error renaming chat:", e);
    }
  };

  return (
    <div className="bg-[#12141E] rounded-xl p-3 border border-gray-800 my-2 min-h-[30vh] max-h-[40vh] flex flex-col">
      {/* Confirm delete */}
      <Modal
        isOpen={showConfirmPopupChat}
        onClose={() => setShowConfirmPopupChat(false)}
        title="Delete Chat?"
      >
        <p className="text-gray-300 mb-4">
          This will permanently delete this chat and all its messages.
        </p>
        <div className="flex space-x-3">
          <button
            onClick={confirmDeleteChat}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-500 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => setShowConfirmPopupChat(false)}
            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        title="Rename Chat"
      >
        <input
          type="text"
          className="w-full rounded-lg bg-[#1E2030] border border-gray-700 focus:border-[#50B7C3] focus:ring-0 text-white placeholder:text-gray-500 px-3 py-2 mb-4 text-sm"
          placeholder="New chat name"
          onChange={(e) => setNewChatName(e.target.value)}
          value={newChatName}
          onKeyDown={(e) => e.key === "Enter" && confirmRenameChat()}
          autoFocus
        />
        <div className="flex space-x-3">
          <button
            onClick={() => setShowRenameModal(false)}
            className="flex-1 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={confirmRenameChat}
            className="flex-1 py-2 bg-gradient-to-r from-[#2E5C82] to-[#50B7C3] text-white rounded-lg font-semibold hover:opacity-90"
          >
            Save
          </button>
        </div>
      </Modal>

      {/* Header */}
      <div className="flex flex-row justify-between items-center mb-2 px-1">
        <h2 className="text-gray-500 uppercase tracking-wide font-semibold text-xs">
          Chat History
        </h2>
        <button
          className="text-gray-400 hover:text-[#50B7C3] transition-colors p-1 rounded"
          title="New chat"
          onClick={() => {
            props
              .createNewChat()
              .then((newChatId) => {
                const chat_name = "Chat " + newChatId;
                props.setIsPrivate(0);
                props.setCurrChatName(chat_name);
                props.setTicker("");
                props.setShowChatbot(false);
                props.onChatSelect(newChatId);
                props.handleForceUpdate();
                props.setConfirmedModelKey("");
              })
              .catch((error) => console.error("Error creating new chat:", error));
          }}
        >
          <FontAwesomeIcon icon={faPenToSquare} />
        </button>
      </div>

      {/* Chat list */}
      <div className="overflow-y-auto flex-1">
        {chats.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-4">No chats yet</p>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => {
              props.onChatSelect(chat.id);
              props.setIsPrivate(chat.model_type);
              props.setTicker(chat.ticker);
              if (chat.ticker) {
                props.setIsEdit(0);
                props.setShowChatbot(true);
              }
              props.setcurrTask(chat.associated_task);
              props.setCurrChatName(chat.chat_name);
            }}
            className={`flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer transition-colors group ${
              props.selectedChatId === chat.id
                ? "bg-gradient-to-r from-[#2E5C82]/30 to-[#50B7C3]/20 border border-[#50B7C3]/30"
                : "hover:bg-[#1E2030]"
            }`}
          >
            <div className="flex items-center space-x-2 min-w-0">
              <FontAwesomeIcon icon={faCommentDots} className="text-gray-500 text-xs flex-shrink-0" />
              <span className="text-gray-300 text-sm truncate">{chat.chat_name}</span>
            </div>
            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); handleRenameChat(chat.id); }}
                className="p-1 rounded text-gray-500 hover:text-[#50B7C3]"
              >
                <FontAwesomeIcon icon={faPen} className="text-xs" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                className="p-1 rounded text-gray-500 hover:text-red-400"
              >
                <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChatHistory;
