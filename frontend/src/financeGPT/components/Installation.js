import React, { useState } from "react";
import "../styles/Chatbot.css";
import { useNavigate } from "react-router-dom";
import { installLocalModel } from "../localModels";


function Installation() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const navigate = useNavigate();

  const goToHomeChatbot = () => {
    navigate("/");
  };

  const installDependencies = async () => {
    setIsLoading(true);
    setStatusMessage("");

    try {
      const response = await installLocalModel(0);
      setStatusMessage(response.message || "Download started. You can continue using the app while it installs.");
    } catch (e) {
      console.error(e);
      setStatusMessage(e.message || "Failed to start the local model installation.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {isLoading ? (
        <div>Loading...</div> // This is your loading indicator
      ) : (
        <div className="text-white flex flex-col mt-2 px-20">
          <div className="flex-grow">
            <h1 className="text-4xl font-semibold flex justify-center pt-10">
              <img src="logo.png" className="w-10 h-10" alt="logo" />
              <span>Private GPT</span>
            </h1>
            <h2 className="text-2xl text-center text-lime-300 font-semibold my-2 mb-10">
              Chat with your financial documents
            </h2>
          </div>
          <div className="flex flex-col text-l font-semibold space-y-4">
            <div>Before using PrivateGPT, there are a few installation steps</div>
            <p>Click <a className="underline" target="_blank" rel="noopener noreferrer" href={"https://github.com/ollama/ollama"}>here</a> to download Ollama</p>
            <p>Once downloaded:</p>
            <div className="w-64 hover:bg-gray-500 cursor-pointer bg-gray-700 p-2 rounded-lg mb-5" onClick={installDependencies}>Install the recommended local model</div>
            {statusMessage ? <p className="text-sm text-gray-300">{statusMessage}</p> : null}
          </div>
          <button onClick={goToHomeChatbot} className="text-xl bg-gray-800 hover:bg-gray-600 w-auto rounded-xl m-2 px-5 py-3 absolute bottom-10 right-10 mb-4 mr-4">
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

export default Installation;
