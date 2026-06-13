import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";

import HomeChatbot from "./financeGPT/components/Home";


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomeChatbot />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
