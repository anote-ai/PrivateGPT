import React, { useCallback, useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import fetcher from "./http/RequestConfig";

import HomeChatbot from "./financeGPT/components/Home.js"
import Installation from "./financeGPT/components/Installation.js"

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));


function App() {
  const [modelsExist, setModelsExist] = useState(null);
  const [modelStatus, setModelStatus] = useState({
    llama2_exists: false,
    mistral_exists: false,
  });

  const checkModelsExist = useCallback(async (attempt = 0) => {
    try {
      const response = await fetcher("check-models", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const responseData = await response.json();
      const hasRequiredModels = Boolean(
        responseData.llama2_exists && responseData.mistral_exists
      );

      setModelStatus(responseData);
      setModelsExist(hasRequiredModels);

      return responseData;
    } catch (e) {
      if (attempt < 20) {
        await wait(1000);
        return checkModelsExist(attempt + 1);
      }

      console.error("Failed to check models:", e.message);
      setModelsExist(false);
      setModelStatus({ llama2_exists: false, mistral_exists: false });
      return { llama2_exists: false, mistral_exists: false };
    }
  }, []);

  useEffect(() => {
    checkModelsExist();
  }, [checkModelsExist]);

  if (modelsExist === null) {
    return (
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
          <div>Checking local model setup...</div>
        </div>
      </div>
    );
  }
  

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <Navigate to={modelsExist ? "/chatbot" : "/installation"} replace />
          }
        />
        <Route
          path="/installation"
          element={
            <Installation
              modelStatus={modelStatus}
              onModelsReady={() => setModelsExist(true)}
              refreshModels={checkModelsExist}
            />
          }
        />
        <Route
          path="/chatbot"
          element={modelsExist ? <HomeChatbot /> : <Navigate to="/installation" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
