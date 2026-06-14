import React from "react";

function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          zIndex: 999,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1000,
          padding: 24,
          borderRadius: 12,
          boxShadow: "0px 8px 32px rgba(0,0,0,0.6)",
          textAlign: "center",
          minWidth: 320,
        }}
        className="bg-[#1E2030] text-white border border-gray-700"
      >
        {title && (
          <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>
        )}
        {children}
      </div>
    </>
  );
}

export default Modal;
