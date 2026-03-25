import { React, useState, useEffect } from "react";
import fetcher from "../../http/RequestConfig";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPen,
  faPenToSquare,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";

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

  const cancelDeleteChat = () => {
    setShowConfirmPopupChat(false);
  };

  const handleRenameChat = (chat_id) => {
    setChatIdToRename(chat_id);
    setShowRenameModal(true);
  };

  const confirmRenameChat = () => {
    renameChat(chatIdToRename, newChatName);
    setShowRenameModal(false);
  };

  const cancelRenameChat = () => {
    setShowRenameModal(false);
  };

  const retrieveAllChats = async () => {
    try {
      const response = await fetcher("retrieve-all-chats", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
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
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_id: chat_id }),
      });

      if (response.ok) {
        props.handleForceUpdate();
        try {
          const recentRes = await fetcher("find-most-recent-chat", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });
          const data = await recentRes.json();
          props.handleChatSelect(data.chat_info.id);
          props.setCurrChatName(data.chat_info.chat_name);
        } catch (e) {
          console.error("Error finding most recent chat after deletion:", e);
        }
      } else {
        console.error("Server responded with non-OK status on delete");
      }
    } catch (e) {
      console.error("Error during chat deletion:", e);
    }
  };

  const renameChat = async (chat_id, new_name) => {
    await fetcher("update-chat-name", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chat_id, chat_name: new_name }),
    }).catch((e) => {
      console.error(e.error);
    });
    retrieveAllChats();
  };

  const deleteConfirmationPopupChat = showConfirmPopupChat ? (
    <div
      style={{
        position: "absolute",
        padding: 20,
        borderRadius: 5,
        boxShadow: "0px 0px 15px rgba(0,0,0,0.5)",
      }}
      className="bg-gray-800 text-white z-50"
    >
      <p>Are you sure you want to delete this chat?</p>
      <div className="flex flex-row justify-between mt-2">
        <button
          onClick={confirmDeleteChat}
          className="bg-[#2A2C38] w-1/2 mx-2 border-white border rounded-xl"
        >
          Yes
        </button>
        <button
          onClick={cancelDeleteChat}
          className="bg-[#2A2C38] w-1/2 mx-2 border-white border rounded-xl"
        >
          No
        </button>
      </div>
    </div>
  ) : null;

  const renameModal = showRenameModal ? (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          zIndex: 999,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1000,
          padding: 20,
          borderRadius: 5,
          boxShadow: "0px 0px 15px rgba(0,0,0,0.5)",
          textAlign: "center",
        }}
        className="bg-gray-800 text-white"
      >
        <div className="my-2">Enter new chat name</div>
        <input
          type="text"
          className="rounded-xl bg-[#3A3B41] border-none focus:ring-0 focus:border-white text-white placeholder:text-gray-300"
          onChange={(e) => setNewChatName(e.target.value)}
          value={newChatName}
        />
        <div className="w-full flex justify-between mt-4">
          <button
            onClick={cancelRenameChat}
            className="w-1/2 mx-2 py-2 bg-gray-700 rounded-lg hover:bg-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={confirmRenameChat}
            className="w-1/2 mx-2 py-2 bg-gray-700 rounded-lg hover:bg-gray-900"
          >
            Save
          </button>
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="flex flex-col px-4 mt-4 bg-[#2A2C38] rounded-xl py-4 my-4 min-h-[35vh] h-[35vh]">
      {deleteConfirmationPopupChat}
      {renameModal}
      <div className="flex flex-row justify-between items-center">
        <h2 className="text-gray-500 uppercase tracking-wide font-semibold text-xs mb-2">
          Chat history
        </h2>
        <button
          className="rounded-full"
          onClick={() => {
            props
              .createNewChat()
              .then((newChatId) => {
                const chat_name = "Chat " + newChatId.toString();
                props.setIsPrivate(0);
                props.setCurrChatName(chat_name);
                props.setTicker("");
                props.setShowChatbot(false);
                props.onChatSelect(newChatId);
                props.handleForceUpdate();
                props.setConfirmedModelKey("");
                retrieveAllChats();
              })
              .catch((error) => {
                console.error("Error creating new chat:", error);
              });
          }}
        >
          <FontAwesomeIcon icon={faPenToSquare} />
        </button>
      </div>
      <div className="overflow-y-auto">
        {chats.map((chat) => (
          <div
            key={chat[0]}
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
            className={`flex items-center justify-between hover:bg-[#3A3B41] px-6 rounded cursor-pointer ${
              props.selectedChatId === chat.id ? "bg-gray-700" : ""
            }`}
          >
            <div className="flex items-center p-2 my-1 rounded-lg mr-2">
              {chat.chat_name}
            </div>
            <div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRenameChat(chat.id);
                }}
                className="p-2 rounded-full"
              >
                <FontAwesomeIcon icon={faPen} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(chat.id);
                }}
                className="p-2 rounded-full"
              >
                <FontAwesomeIcon icon={faTrashCan} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChatHistory;
