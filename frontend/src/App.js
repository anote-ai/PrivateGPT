import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import HomeChatbot from "./financeGPT/components/Home.js";
import { NotificationProvider } from "./components/Notifications";

function App() {
  return (
    <NotificationProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomeChatbot />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </Router>
    </NotificationProvider>
  );
}

export default App;
