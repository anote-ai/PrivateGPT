import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import HomeChatbot from "./financeGPT/components/Home.js";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomeChatbot />} />
      </Routes>
    </Router>
  );
}

export default App;
