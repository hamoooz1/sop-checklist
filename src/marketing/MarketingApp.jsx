import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MarketingLayout from "./MarketingLayout";
import Home from "./Home";
import Contact from "./Contact";
import Login from "./Login";
import Signup from "./Signup";
import Tutorial from "./Tutorial";

export default function MarketingApp() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route index element={<Home />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/tutorial" element={<Tutorial />} />
      </Route>

      {/* fallbacks */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
