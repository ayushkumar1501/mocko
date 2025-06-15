// frontend/src/main.jsx (Integrate React Router & Pass Demo Mode)

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import ValidationDetailView from './components/ValidationDetailView.jsx';
import './index.css';

const DEMO_MODE = true; // Define DEMO_MODE here

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route
          path="/details"
          element={<ValidationDetailView isDemoMode={DEMO_MODE} />}
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);


// frontend/src/App.jsx (Corrected for Router Nesting - Final)

import React, { useState, useEffect, useCallback, useRef } from 'react';
// --- REMOVED: import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'; ---
import ChatSidebar from './components/ChatSidebar';
import ChatWindow from './components/ChatWindow';
// --- REMOVED: import ValidationDetailView from './components/ValidationDetailView'; ---

// --- Corrected Import: Now imports generateDemoId and createDemoMessage ---
import { demoChatSessions, generateDemoId, createDemoMessage } from './demo'; 

// --- DEMO MODE IS ALWAYS TRUE FOR THIS VERSION ---
// This version is designed to run purely on frontend demo data.
// If you want to switch to a live backend, you will need to revert
// the changes made in this file and ChatWindow.jsx, and re-introduce
// the API calls.
const DEMO_MODE = true; // This constant is kept here for ChatWindow's direct usage,
                       // but the route definition for ValidationDetailView in main.jsx
                       // will pass it explicitly.

function App() {
  const [chatSessions, setChatSessions] = useState([]);
  const [currentChatSession, setCurrentChatSession] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  const currentChatSessionIdRef = useRef(null);
  useEffect(() => {
    currentChatSessionIdRef.current = currentChatSession?.id;
  }, [currentChatSession]);

  // Modified loadChatSessions to ONLY use demo data AND seed localStorage
  const loadChatSessions = useCallback(async (explicitlySelectSessionId = null) => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      // Always use demo data in this version
      const sessions = demoChatSessions; 
      console.log("DEMO MODE: Loaded demo chat sessions.");

      // NEW: Seed localStorage with pre-defined demo invoice results
      // This ensures that even existing demo sessions' detailed views work on reload
      sessions.forEach(session => {
        session.messages.forEach(msg => {
          if (msg.type === 'validation_result' && msg.payload && msg.payload.invoice_result_id) {
            // Store the entire payload, as ValidationDetailView expects it
            localStorage.setItem(`invoiceResult-${msg.payload.invoice_result_id}`, JSON.stringify(msg.payload));
          }
        });
      });
      console.log("DEMO MODE: Seeded localStorage with pre-defined demo results.");
      
      setChatSessions(sessions);

      let newCurrentSession = null;
      if (explicitlySelectSessionId) {
        newCurrentSession = sessions.find(s => s.id === explicitlySelectSessionId);
      } else if (currentChatSessionIdRef.current) {
        newCurrentSession = sessions.find(s => s.id === currentChatSessionIdRef.current);
      }
      
      setCurrentChatSession(newCurrentSession || sessions[0] || null);

    } catch (error) {
      console.error("Error loading demo chat sessions (unexpected):", error);
      setHistoryError("Failed to load demo chat history.");
      setChatSessions([]);
      setCurrentChatSession(null);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadChatSessions();
  }, [loadChatSessions]);

  useEffect(() => {
    if (currentChatSession && chatSessions.length > 0) {
      const updatedCurrent = chatSessions.find(s => s.id === currentChatSession.id);
      if (!updatedCurrent) {
        setCurrentChatSession(chatSessions[0] || null);
      } else if (updatedCurrent !== currentChatSession) {
        if (updatedCurrent.updated_at.getTime() !== currentChatSession.updated_at.getTime() || 
            updatedCurrent.messages.length !== currentChatSession.messages.length) {
          setCurrentChatSession(updatedCurrent);
        }
      }
    } else if (!currentChatSession && chatSessions.length > 0) {
      setCurrentChatSession(chatSessions[0]);
    } else if (chatSessions.length === 0 && currentChatSession) {
        setCurrentChatSession(null);
    }
  }, [chatSessions, currentChatSession]);

  const handleSelectSession = useCallback((session) => {
    if (session.id !== currentChatSession?.id) {
      setCurrentChatSession(session);
    }
  }, [currentChatSession]);

  // Modified handleNewChat to ONLY create a new dynamic demo session
  const handleNewChat = useCallback(async () => {
    console.log("DEMO MODE: 'New Chat' clicked. Creating new demo session dynamically.");
    setIsLoadingHistory(true);

    const newDemoId = generateDemoId();
    const newEmptySession = {
      id: newDemoId,
      invoice_result_id: null, // Initially null, will be set after a simulated upload
      title: `New Chat (${new Date().toLocaleTimeString()})`,
      created_at: new Date(),
      updated_at: new Date(),
      messages: [
          createDemoMessage('assistant', "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.", 'initial_welcome', {}),
          createDemoMessage('assistant', 'Please upload your invoice document to get started. You can attach it using the paperclip icon below.', 'prompt_upload_invoice', {})
      ],
    };
    
    setChatSessions(prevSessions => [newEmptySession, ...prevSessions]);
    setCurrentChatSession(newEmptySession);
    setIsLoadingHistory(false);

  }, []);

  // Modified onMessageSentOrUploaded to simply ensure current session is updated
  const onMessageSentOrUploaded = useCallback(() => {
    console.log("DEMO MODE: Message or file uploaded. Frontend state already updated.");
    if (currentChatSession) {
      const updatedCurrent = chatSessions.find(s => s.id === currentChatSession.id);
      if (updatedCurrent) {
        setCurrentChatSession(updatedCurrent);
      }
    }
  }, [currentChatSession, chatSessions]);

  return (
    // Removed <Router> and <Routes> from App.jsx
    <div className="flex h-screen overflow-hidden font-inter bg-white">
      <ChatSidebar
        chatSessions={chatSessions}
        selectedSession={currentChatSession}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        isLoadingHistory={isLoadingHistory}
        historyError={historyError}
      />
      {/* ChatWindow is now rendered directly by App.jsx */}
      <ChatWindow
        currentChatSession={currentChatSession}
        onMessageSentOrUploaded={onMessageSentOrUploaded}
        isDemoMode={DEMO_MODE} 
      />
      {/* ValidationDetailView is rendered by main.jsx's router */}
    </div>
  );
}

export default App;


// frontend/src/components/ValidationDetailView.jsx (Detailed Validation Report with LocalStorage Demo Retrieval)

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom'; // Using useLocation for query params
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'; // Icons

// *** TO CHANGE FOR LIVE API MODE ***
// If you switch to live API mode (isDemoMode = false in main.jsx),
// uncomment the line below to import your actual API function.
// import { fetchInvoiceResultDetails } from '../api'; 

// Removed direct import of demoChatSessions as we'll use localStorage
// import { demoChatSessions } from '../demo'; 

function ValidationDetailView({ isDemoMode }) { 
  const [validationData, setValidationData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const invoiceResultId = queryParams.get('id'); // Get ID from query parameter

  useEffect(() => {
    const loadDetails = async () => {
      if (!invoiceResultId) {
        setError("Invoice Result ID not provided in URL.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (isDemoMode) {
          console.log("DEMO MODE: Loading validation details from localStorage for ID:", invoiceResultId);
          await new Promise(resolve => setTimeout(resolve, 500)); // Simulate loading delay

          const storedData = localStorage.getItem(`invoiceResult-${invoiceResultId}`);
          if (storedData) {
            const parsedData = JSON.parse(storedData);
            setValidationData(parsedData);
            console.log("DEMO MODE: Found demo validation details in localStorage:", parsedData);
          } else {
            setError(`Demo data not found in localStorage for ID: ${invoiceResultId}. This might be an old session or data was cleared.`);
            console.warn(`DEMO MODE: Demo data not found in localStorage for ID: ${invoiceResultId}`);
          }

        } else {
          // *** LIVE API MODE: Uncomment the import at the top of this file first! ***
          // import { fetchInvoiceResultDetails } from '../api'; 
          // Then uncomment the lines below.
          // console.log("API MODE: Fetching validation details from backend for ID:", invoiceResultId);
          // const data = await fetchInvoiceResultDetails(invoiceResultId);
          // setValidationData(data);
          // console.log("API MODE: Fetched validation details:", data);
          setError("API MODE is active, but backend is not running or API call is commented out. Please start your backend or switch to DEMO MODE in main.jsx.");
        }
      } catch (err) {
        console.error("Error loading validation details:", err);
        setError(err.message || "Failed to load validation details.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDetails();
  }, [invoiceResultId, isDemoMode]); // Reload if ID or demo mode changes

  // Safely access data, using summary from payload if it's there
  // The 'payload' itself from ValidationDetailView will contain status, message, invoice_result_id, and result_summary
  const extracted_invoice_data = validationData?.result_summary?.extracted_invoice_fields;
  const invoice_validation_issues = validationData?.result_summary?.invoice_validation_issues;
  const extracted_po_data = validationData?.result_summary?.extracted_po_data;
  const po_comparison_results = validationData?.result_summary?.po_comparison_results;
  const summary = validationData?.result_summary; // This should directly be the result_summary from the stored payload


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        Loading detailed validation report...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-red-600 p-4 text-center">
        <XCircle className="h-10 w-10 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Report</h2>
        <p className="mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()} // Simple reload to retry
          className="px-4 py-2 bg-custom-red text-white rounded-md hover:bg-custom-red-dark transition-colors flex items-center"
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </button>
      </div>
    );
  }

  // Handle case where validationData itself might be null after loading (e.g., ID not found)
  if (!validationData || !summary) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700">
        No validation data found for this ID. Please go back to the chat and upload a document.
      </div>
    );
  }

  // Helper to safely get nested values
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  const getFieldStatus = (fieldPath, issues) => {
    if (issues && issues[fieldPath]) {
      return { isValid: false, message: issues[fieldPath] };
    }
    if (po_comparison_results?.missing_in_invoice && po_comparison_results.missing_in_invoice.includes(fieldPath)) {
        return { isValid: false, message: "Missing in invoice (as per PO comparison)." };
    }
    return { isValid: true, message: "Present and valid" };
  };

  const renderField = (fieldPath, extractedData, issues, label, isPoField = false) => {
    const value = getNestedValue(extractedData, fieldPath);
    const { isValid, message } = getFieldStatus(fieldPath, issues);

    let poMismatch = null;
    if (!isPoField && po_comparison_results?.mismatched_fields && po_comparison_results.mismatched_fields[fieldPath]) {
        poMismatch = po_comparison_results.mismatched_fields[fieldPath];
    }

    return (
      <div key={fieldPath} className="flex items-center p-2 border-b border-gray-200 last:border-b-0">
        <span className="w-1/3 font-medium text-gray-700">{label}:</span>
        <span className="w-1/2 text-gray-800 break-words pr-2">
          {value === null || value === "" ? (
            <span className="text-gray-500 italic">Not Extracted / N/A</span>
          ) : typeof value === 'object' ? (
            <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-2 rounded">{JSON.stringify(value, null, 2)}</pre>
          ) : (
            String(value)
          )}
        </span>
        <span className="w-1/6 flex-shrink-0 flex justify-end">
          {isValid ? (
            <CheckCircle className="h-5 w-5 text-green-500" title="Valid" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" title={`Issue: ${message}`} />
          )}
        </span>
        {!isValid && <span className="text-red-500 text-xs ml-2">{message}</span>}
        {poMismatch && !isPoField && (
            <span className="text-yellow-600 text-xs ml-2">
                PO Mismatch: Invoice: {poMismatch.invoice_value}, PO: {poMismatch.po_value}
            </span>
        )}
      </div>
    );
  };

  const renderLineItem = (item, index, type) => {
    const isInvoiceItem = type === 'invoice';
    const itemPrefix = isInvoiceItem ? 'invoice' : 'po';
    
    const detailedLineItemMismatches = po_comparison_results?.mismatched_fields?.line_item_details?.find(
        m => m.type === 'item_value_mismatch' && m.item_index === index
    );

    let itemOverallValid = true;
    let itemMismatchDetails = {};

    if (detailedLineItemMismatches) {
        itemOverallValid = false;
        itemMismatchDetails = detailedLineItemMismatches.mismatches;
    }

    return (
      <div key={`${itemPrefix}-item-${index}`} className={`border p-3 rounded-md mb-3 ${itemOverallValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <h4 className="font-semibold mb-2 text-md flex items-center">
          {isInvoiceItem ? "Invoice Item" : "PO Item"} #{index + 1}
          {itemOverallValid ? <CheckCircle className="h-4 w-4 text-green-600 ml-2" /> : <XCircle className="h-4 w-4 text-red-600 ml-2" />}
        </h4>
        {['description', 'quantity', 'unit_price', 'total_line_amount', 'item_tax_rate', 'item_amount_of_tax_charged'].map(key => {
          const fieldLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const isMismatched = itemMismatchDetails[key];

          let displayValue = typeof item[key] === 'object' ? JSON.stringify(item[key]) : String(item[key]);
          let mismatchNote = '';

          if (isMismatched) {
              displayValue = `Invoice: ${JSON.stringify(isMismatched.invoice_value)}, PO: ${JSON.stringify(isMismatched.po_value)}`;
              mismatchNote = ` (Issue: ${isMismatched.issue?.replace(/_/g, ' ') || 'Mismatch'})`;
          }

          return (
            <p key={`${itemPrefix}-item-${index}-${key}`} className="text-sm">
              <span className="font-medium">{fieldLabel}: </span>
              <span className={`${isMismatched ? 'text-red-600' : ''}`}>
                {displayValue}
              </span>
              {isMismatched && (
                <span className="text-xs text-red-500 ml-2">
                  {mismatchNote}
                </span>
              )}
            </p>
          );
        })}
      </div>
    );
  };

  // List of fields to display, with their labels and corresponding paths in extracted_invoice_data
  const invoiceFieldsToDisplay = [
    { path: "invoice_number", label: "Invoice Number" },
    { path: "invoice_date", label: "Invoice Date" },
    { path: "po_number_extracted", label: "PO Number (from Invoice)" },
    { path: "bond_lut_number", label: "BOND/LUT No." },
    { path: "supplier_details.name", label: "Supplier Name" },
    { path: "supplier_details.address", label: "Supplier Address" },
    { path: "supplier_details.gstin", label: "Supplier GSTIN" },
    { path: "recipient_details.name", label: "Recipient Name" },
    { path: "recipient_details.address", label: "Recipient Address" },
    { path: "recipient_details.gstin", label: "Recipient GSTIN" },
    { path: "delivery_address", label: "Delivery Address" },
    { path: "hsn_sac_code", label: "HSN/SAC Code" },
    { path: "quantity_code", label: "Overall Quantity Code" },
    { path: "total_value_of_supply", label: "Total Value of Supply" },
    { path: "taxable_value_of_supply", label: "Taxable Value of Supply" },
    { path: "tax_rate", label: "Overall Tax Rate" },
    { path: "amount_of_tax_charged", label: "Amount of Tax Charged" },
    { path: "place_of_supply", label: "Place of Supply" },
    { path: "delivery_address_different", label: "Delivery Address Different" },
    { path: "tax_payable_on_reverse_charge", label: "Tax Payable on Reverse Charge" },
    { path: "manual_digital_signature", label: "Manual/Digital Signature" },
    { path: "remarks", label: "Remarks" },
  ];

  const poFieldsToDisplay = [
      { path: "po_number", label: "PO Number" },
      { path: "po_date", label: "PO Date" },
      { path: "invoice_number", label: "Invoice Number (from PO)" },
      { path: "invoice_date", label: "Invoice Date (from PO)" },
      { path: "bond_lut_number", label: "BOND/LUT No." },
      { path: "supplier_details.name", label: "Supplier Name" },
      { path: "supplier_details.address", label: "Supplier Address" },
      { path: "supplier_details.gstin", label: "Supplier GSTIN" },
      { path: "recipient_details.name", label: "Recipient Name" },
      { path: "recipient_details.address", label: "Recipient Address" },
      { path: "recipient_details.gstin", label: "Recipient GSTIN" },
      { path: "delivery_address", label: "Delivery Address" },
      { path: "hsn_sac_code", label: "HSN/SAC Code" },
      { path: "quantity_code", label: "Overall Quantity Code" },
      { path: "total_amount", label: "PO Total Amount" },
      { path: "total_value_of_supply", label: "Total Value of Supply (from PO)" },
      { path: "taxable_value_of_supply", label: "Taxable Value of Supply (from PO)" },
      { path: "tax_rate", label: "Overall Tax Rate (from PO)" },
      { path: "amount_of_tax_charged", label: "Amount of Tax Charged (from PO)" },
      { path: "place_of_supply", label: "Place of Supply (from PO)" },
      { path: "delivery_address_different", label: "Delivery Address Different (from PO)" },
      { path: "tax_payable_on_reverse_charge", label: "Tax Payable on Reverse Charge (from PO)" },
      { path: "manual_digital_signature", label: "Manual/Digital Signature (from PO)" },
      { path: "remarks", label: "Remarks (from PO)" },
  ];


  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-4xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 border-b-2 pb-3 border-custom-red">
          Invoice Validation Report
        </h1>

        {/* Overall Summary */}
        <div className="mb-8 p-4 bg-gray-50 rounded-md border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-700 mb-3">Overall Status</h2>
          <p className="mb-2">
            **Invoice Number:** <span className="font-medium">{summary?.invoice_number || 'N/A'}</span>
          </p>
          <p className="mb-2">
            **Selected Checklist Option:**{' '}
            <span className="font-medium">
              {summary?.selected_checklist_option ? summary.selected_checklist_option.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'}
            </span>
          </p>
          <p className="mb-2 flex items-center">
            **Invoice Validation Status:**{' '}
            <span className={`font-semibold ml-2 flex items-center ${summary?.overall_invoice_validation_status === 'Accepted' ? 'text-green-600' : 'text-red-600'}`}>
              {summary?.overall_invoice_validation_status}
              {summary?.overall_invoice_validation_status === 'Accepted' ? <CheckCircle className="h-5 w-5 ml-2" /> : <XCircle className="h-5 w-5 ml-2" />}
            </span>
          </p>
          <p className="mb-2 flex items-center">
            **PO Comparison Status:**{' '}
            <span className={`font-semibold ml-2 flex items-center ${
                summary?.overall_po_comparison_status === 'Accepted' || summary?.overall_po_comparison_status === 'N/A (No PO Provided)'
                  ? 'text-green-600' : 'text-red-600'
            }`}>
              {summary?.overall_po_comparison_status}
              {summary?.overall_po_comparison_status === 'Accepted' || summary?.overall_po_comparison_status === 'N/A (No PO Provided)' ? <CheckCircle className="h-5 w-5 ml-2" /> : <XCircle className="h-5 w-5 ml-2" />}
            </span>
          </p>
          <p className="mt-4 text-gray-600 italic">"{summary?.summary_message}"</p>
        </div>

        {/* Extracted Invoice Data */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-700 mb-4 border-b pb-2">Extracted Invoice Data & Checklist Validation</h2>
          <div className="border border-gray-200 rounded-md bg-white">
            {invoiceFieldsToDisplay.map(field => 
              renderField(field.path, extracted_invoice_data, invoice_validation_issues, field.label)
            )}
            {/* Render Invoice Line Items */}
            {extracted_invoice_data?.items && extracted_invoice_data.items.length > 0 && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <h3 className="font-bold text-gray-700 mb-3">Line Items:</h3>
                {extracted_invoice_data.items.map((item, index) => renderLineItem(item, index, 'invoice'))}
              </div>
            )}
            {/* Display message if no line items extracted */}
            {(!extracted_invoice_data?.items || extracted_invoice_data.items.length === 0) && (
                 <p className="p-4 text-gray-500 italic">No line items extracted from invoice.</p>
            )}
          </div>
        </div>

        {/* PO Comparison Results */}
        {extracted_po_data ? (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4 border-b pb-2">Extracted PO Data & Comparison</h2>
            <div className="border border-gray-200 rounded-md bg-white">
                {poFieldsToDisplay.map(field =>
                    // Pass a filtered issues object for PO fields
                    renderField(field.path, extracted_po_data, 
                        po_comparison_results?.missing_in_po?.reduce((acc, miss_path) => { 
                            if (miss_path === field.path) acc[field.path] = `Missing in PO.`; 
                            return acc; 
                        }, {}) || {}, 
                        field.label, true)
                )}
                {/* Render PO Line Items */}
                {extracted_po_data?.items && extracted_po_data.items.length > 0 && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                        <h3 className="font-bold text-gray-700 mb-3">PO Line Items:</h3>
                        {extracted_po_data.items.map((item, index) => renderLineItem(item, index, 'po'))}
                    </div>
                )}
                {/* Display message if no line items extracted from PO */}
                {(!extracted_po_data?.items || extracted_po_data.items.length === 0) && (
                    <p className="p-4 text-gray-500 italic">No line items extracted from PO.</p>
                )}
            </div>

            {/* Detailed PO Mismatches Summary */}
            {po_comparison_results?.mismatched_fields && Object.keys(po_comparison_results.mismatched_fields).length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-lg font-semibold text-red-700 mb-2">Detailed PO Mismatches:</h3>
                    {Object.entries(po_comparison_results.mismatched_fields).map(([field, values]) => {
                        // Handle line_item_details separately as they are complex
                        if (field === "line_item_details") {
                            return (
                                <div key={field}>
                                    <h4 className="text-md font-semibold text-red-600 mb-2 mt-3">Line Item Discrepancies:</h4>
                                    {(values || []).map((mismatch_detail, index) => (
                                        <div key={`line-mismatch-summary-${index}`} className="mb-2 text-sm">
                                            {mismatch_detail.type === "count_mismatch" && (
                                                <p className="text-red-600">{mismatch_detail.message}</p>
                                            )}
                                            {mismatch_detail.type === "extra_invoice_item" && (
                                                <p className="text-red-600">Extra Invoice Item #{mismatch_detail.item_index + 1}: {JSON.stringify(mismatch_detail.invoice_item)}</p>
                                            )}
                                            {mismatch_detail.type === "extra_po_item" && (
                                                <p className="text-red-600">Extra PO Item #{mismatch_detail.item_index + 1}: {JSON.stringify(mismatch_detail.po_item)}</p>
                                            )}
                                            {mismatch_detail.type === "item_value_mismatch" && (
                                                <>
                                                    <p className="font-medium text-red-600">Item #{mismatch_detail.item_index + 1} Field Mismatches:</p>
                                                    <ul className="list-disc list-inside ml-4 text-red-600">
                                                        {Object.entries(mismatch_detail.mismatches).map(([subField, subValues]) => (
                                                            <li key={`${index}-${subField}`}>
                                                                <span className="font-medium">{subField.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
                                                                Invoice: {JSON.stringify(subValues.invoice_value)}, PO: {JSON.stringify(subValues.po_value)}
                                                                {subValues.issue && ` (${subValues.issue.replace(/_/g, ' ')})`}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            );
                        } else {
                            // Standard top-level field mismatch
                            return (
                                <p key={field} className="text-red-600 text-sm mb-1">
                                    <span className="font-medium">{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>{' '}
                                    Invoice Value: {JSON.stringify(values.invoice_value)}, PO Value: {JSON.stringify(values.po_value)}
                                </p>
                            );
                        }
                    })}
                </div>
            )}

            {/* Missing in Invoice (based on PO) */}
            {po_comparison_results?.missing_in_invoice && po_comparison_results.missing_in_invoice.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-lg font-semibold text-red-700 mb-2">Fields Missing in Invoice (based on PO):</h3>
                    <ul className="list-disc list-inside">
                        {po_comparison_results.missing_in_invoice.map((field, index) => (
                            <li key={`missing-inv-${index}`} className="text-red-600 text-sm">{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>
                        ))}
                    </ul>
                </div>
            )}
             {/* Missing in PO (based on Invoice) */}
             {po_comparison_results?.missing_in_po && po_comparison_results.missing_in_po.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                    <h3 className="text-lg font-semibold text-red-700 mb-2">Fields Missing in PO (based on Invoice):</h3>
                    <ul className="list-disc list-inside">
                        {po_comparison_results.missing_in_po.map((field, index) => (
                            <li key={`missing-po-${index}`} className="text-red-600 text-sm">{field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</li>
                        ))}
                    </ul>
                </div>
            )}

          </div>
        ) : (
          <div className="mb-8 p-4 bg-gray-50 rounded-md border border-gray-200 text-gray-600 italic">
            No Purchase Order data available for comparison.
          </div>
        )}
      </div>
    </div>
  );
}

export default ValidationDetailView;


// frontend/src/components/MessageBubble.jsx (Validation Result Summary & Details Button)

import React from 'react';
import { CheckCircle, XCircle, Info, FileText } from 'lucide-react'; // Icons for status, info, file type
import { useNavigate } from 'react-router-dom'; // Import useNavigate for programmatic navigation

function MessageBubble({ message, role, timestamp, type, payload }) {
  const isUser = role === 'user';
  const bubbleClasses = isUser
    ? 'bg-custom-red text-white ml-auto rounded-br-none'
    : 'bg-white text-gray-800 mr-auto rounded-bl-none border border-gray-200 shadow-md';

  const timestampClasses = isUser ? 'text-gray-200' : 'text-gray-500';

  const navigate = useNavigate(); // Initialize useNavigate

  // Function to open the details page in a new tab
  const openDetailsPage = () => {
    // Check if payload and invoice_result_id exist, and if it's not a loading indicator message
    if (type === 'validation_result' && payload && payload.invoice_result_id) {
      // Construct the URL for the new details page
      const detailsUrl = `/details?id=${payload.invoice_result_id}`;
      // Open in a new tab/window
      window.open(detailsUrl, '_blank'); 
    } else {
      console.warn("Cannot open details: invoice_result_id is missing from payload or message type is not 'validation_result'.");
      // Optionally, show a user-friendly message in the UI
    }
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`p-3 rounded-lg max-w-xl break-words ${bubbleClasses}`}>
        {type === 'initial_welcome' && (
          <div className="flex items-center text-lg font-semibold mb-1">
            <Info className="h-5 w-5 mr-2" />
            Welcome!
          </div>
        )}
        {type === 'prompt_to_start' && (
          <div className="flex items-center text-md font-medium mb-1">
            <Info className="h-5 w-5 mr-2" />
            Getting Started:
          </div>
        )}
        {type === 'file_upload' && (
          <div className="flex items-center text-md font-medium mb-1">
            <FileText className="h-5 w-5 mr-2" />
            {message}
          </div>
        )}
        {type === 'prompt_upload_invoice' && (
          <div className="flex items-center text-md font-medium mb-1">
            <Info className="h-5 w-5 mr-2" />
            Action Required:
          </div>
        )}
        {type === 'prompt_upload_po' && (
          <div className="flex items-center text-md font-medium mb-1">
            <Info className="h-5 w-5 animate-spin mr-2" />
            {message}
          </div>
        )}

        {/* --- Display for Validation Results (Summarized) --- */}
        {type === 'validation_result' && payload ? (
          <div>
            <div className="font-semibold text-lg mb-2 flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Invoice Validation Summary:
            </div>
            <p className="mb-1">
              Invoice Number: {payload.invoice_number || 'N/A'}
            </p>
            <p className="mb-1">
              Selected Checklist: {payload.selected_checklist_option ? payload.selected_checklist_option.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'}
            </p>
            <p className="mb-1 flex items-center">
              Invoice Validity:{' '}
              {payload.overall_invoice_validation_status === 'Accepted' ? (
                <CheckCircle className="h-5 w-5 text-green-500 ml-1" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 ml-1" />
              )}{' '}
              {payload.overall_invoice_validation_status}
            </p>
            <p className="mb-2 flex items-center">
              PO Comparison:{' '}
              {payload.overall_po_comparison_status === 'Accepted' || payload.overall_po_comparison_status === 'N/A (No PO Provided)' ? (
                <CheckCircle className="h-5 w-5 text-green-500 ml-1" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 ml-1" />
              )}{' '}
              {payload.overall_po_comparison_status}
            </p>
            {/* Detailed View Button - Only visible if invoice_result_id is present */}
            {payload.invoice_result_id && (
              <button
                onClick={openDetailsPage}
                className="mt-3 px-4 py-2 bg-custom-red text-white rounded-md hover:bg-custom-red-dark transition-colors shadow-md"
              >
                See What's Missing / Present
              </button>
            )}
          </div>
        ) : (
          // Default message display for other types or if payload is missing
          <p>{message}</p>
        )}

        <div className={`text-xs mt-1 ${timestampClasses}`}>
          {timestamp.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;



// frontend/src/components/ChatWindow.jsx (Fully Demo-Ready with LocalStorage for Details)

import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Send, Loader2 } from 'lucide-react'; // Icons for attach, send, loading
// Removed backend API imports as this is now a pure frontend demo version
// import { uploadInvoice, sendChatQuery, addMessageToSession } from '../api';

// NEW: Import demo chat sessions and helpers for consistent data generation
import { demoChatSessions, generateDemoId, createDemoMessage } from '../demo'; 

import MessageBubble from './MessageBubble'; // Import the MessageBubble component
import UploadModal from './UploadModal'; // Import the new UploadModal

function ChatWindow({ currentChatSession, onMessageSentOrUploaded, isDemoMode }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStep, setUploadStep] = useState('welcome'); // 'welcome', 'awaiting_invoice', 'chatting'
  const [currentInvoiceResultId, setCurrentInvoiceResultId] = useState(null); // Stores the invoice_result_id for the current session
  const [showUploadModal, setShowUploadModal] = useState(false); // State to control modal visibility

  const messagesEndRef = useRef(null); // Ref for auto-scrolling chat to bottom

  // --- Effect to load messages and set uploadStep when currentChatSession changes ---
  useEffect(() => {
    console.log('ChatWindow useEffect: currentChatSession changed to:', currentChatSession);
    setInputMessage('');

    if (currentChatSession) {
      setMessages(currentChatSession.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
      })));
      setCurrentInvoiceResultId(currentChatSession.invoice_result_id || null);
      
      if (currentChatSession.invoice_result_id) {
        setUploadStep('chatting');
      } else {
        const initialWelcomeMessages = [
          createDemoMessage('assistant', "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.", 'initial_welcome', {}),
          createDemoMessage('assistant', 'Please upload your invoice document to get started using the paperclip icon below.', 'prompt_upload_invoice', {}),
        ];
        setMessages(initialWelcomeMessages);
        setUploadStep('awaiting_invoice');
      }

    } else {
      setMessages([
        createDemoMessage('assistant', "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.", 'initial_welcome', {}),
        createDemoMessage('assistant', 'Please click "New Chat" on the sidebar to get started or select an existing session.', 'prompt_to_start', {}),
      ]);
      setUploadStep('welcome');
      setCurrentInvoiceResultId(null);
    }
  }, [currentChatSession]);

  // Auto-scroll to bottom of messages whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // --- Handle Upload from Modal (SIMULATED) ---
  const handleModalUploadAndClose = async (invoiceFile, poFile, hasPo) => {
    setShowUploadModal(false);

    if (!currentChatSession?.id) {
        console.error("handleModalUploadAndClose: No active session ID found. currentChatSession:", currentChatSession);
        return;
    }

    setIsLoading(true);

    const userMessageContent = poFile 
        ? `Uploaded Invoice: ${invoiceFile.name}, PO: ${poFile.name}`
        : `Uploaded Invoice: ${invoiceFile.name} (No PO)`;
    
    const userMessageForChat = createDemoMessage(
        'user', 
        userMessageContent, 
        'file_upload', 
        { invoiceFileName: invoiceFile.name, poFileName: poFile?.name || null }
    );

    setMessages(prev => [...prev, userMessageForChat]);
    setMessages(prev => [...prev, createDemoMessage('assistant', 'Processing your documents...', 'loading_indicator')]);
    
    try {
        console.log("DEMO MODE: Simulating document upload and processing.");
        await new Promise(resolve => setTimeout(resolve, 2000));

        let simulatedResultPayload;
        // Dynamically select a demo payload based on filename patterns
        if (invoiceFile.name.toLowerCase().includes("rejected") || (poFile && poFile.name.toLowerCase().includes("mismatch"))) {
          simulatedResultPayload = demoChatSessions.find(s => 
            s.title.includes("Rejected") || s.title.includes("Mismatches")
          )?.messages.find(m => m.type === 'validation_result')?.payload;
        } else if (invoiceFile.name.toLowerCase().includes("accepted") && poFile && poFile.name.toLowerCase().includes("match")) {
          simulatedResultPayload = demoChatSessions.find(s => 
            s.title.includes("Invoice & PO Match")
          )?.messages.find(m => m.type === 'validation_result')?.payload;
        } else {
          simulatedResultPayload = demoChatSessions.find(s => 
            s.title.includes("Accepted Invoice (No PO)")
          )?.messages.find(m => m.type === 'validation_result')?.payload;
        }

        // Fallback if no specific demo is found, ensuring a unique ID
        if (!simulatedResultPayload) {
          console.warn("Could not find a specific demo payload. Using a generic accepted one.");
          const fallbackId = generateDemoId();
          simulatedResultPayload = {
            status: "accepted",
            message: "Demo: Documents processed! Here are the results (default accepted).",
            invoice_result_id: fallbackId,
            result_summary: {
              ...demoChatSessions[0].messages[1].payload.result_summary,
              invoice_number: `DEMO-${fallbackId.substring(5,10).toUpperCase()}`,
              summary_message: "Demo: Default accepted invoice for unknown file."
            },
          };
        } else {
            // Clone the payload and ensure a NEW unique invoice_result_id for this specific simulated event
            simulatedResultPayload = {
                ...simulatedResultPayload,
                invoice_result_id: generateDemoId()
            };
            if (simulatedResultPayload.result_summary) {
                simulatedResultPayload.result_summary.invoice_result_id = simulatedResultPayload.invoice_result_id;
            }
        }

        const finalAssistantMessage = createDemoMessage(
            'assistant',
            simulatedResultPayload.message || 'Documents processed! Here are the results.',
            'validation_result',
            simulatedResultPayload // Pass the ENTIRE simulatedResultPayload as payload
        );
        
        // Store the full simulated result in localStorage with its NEW, UNIQUE invoice_result_id
        localStorage.setItem(`invoiceResult-${finalAssistantMessage.payload.invoice_result_id}`, JSON.stringify(finalAssistantMessage.payload));
        console.log(`Stored demo result in localStorage with key: invoiceResult-${finalAssistantMessage.payload.invoice_result_id}`);

        setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), finalAssistantMessage]);
        
        // Update current session's invoice_result_id and messages locally
        if (currentChatSession) {
            currentChatSession.invoice_result_id = finalAssistantMessage.payload.invoice_result_id;
            currentChatSession.messages.push(userMessageForChat);
            currentChatSession.messages.push(finalAssistantMessage);
            currentChatSession.updated_at = new Date();
        }

        setCurrentInvoiceResultId(finalAssistantMessage.payload.invoice_result_id);
        onMessageSentOrUploaded();
        setUploadStep('chatting');

    } catch (error) {
        console.error('DEMO MODE: Simulated error during document upload:', error);
        const errorMessage = `Demo Error: Failed to simulate document processing. ${error.message || 'Please try again.'}`;
        const errorMsgObj = createDemoMessage('assistant', errorMessage, 'error');
        setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), errorMsgObj]);
        
        if (currentChatSession) {
          currentChatSession.messages.push(userMessageForChat);
          currentChatSession.messages.push(errorMsgObj);
          currentChatSession.updated_at = new Date();
        }
        onMessageSentOrUploaded();
    } finally {
        setIsLoading(false);
    }
  };


  // --- Message Sending Logic (SIMULATED) ---
  const handleSendMessage = async (event) => {
    event.preventDefault();

    if (!currentChatSession?.id || isLoading) {
      console.warn("Cannot send message: No active session ID or still loading.");
      return;
    }

    const trimmedInputMessage = inputMessage.trim();
    
    if (uploadStep !== 'chatting' || trimmedInputMessage === '') {
        console.warn("Attempted to send, but not in chat mode or message is empty.");
        return;
    }

    setIsLoading(true);
    setInputMessage('');

    const userMessageForChat = createDemoMessage('user', trimmedInputMessage, 'text_message');

    setMessages(prev => [...prev, userMessageForChat]);
    
    try {
        console.log("DEMO MODE: Simulating text query response.");
        await new Promise(resolve => setTimeout(resolve, 800));
        const demoAssistantResponse = createDemoMessage(
            'assistant',
            `Demo response: You asked, "${trimmedInputMessage}". In this demo mode, I provide static responses for text queries. Please use the file upload functionality for invoice validation scenarios.`,
            'text_message'
        );
        
        setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), demoAssistantResponse]);
        
        if (currentChatSession) {
          currentChatSession.messages.push(userMessageForChat);
          currentChatSession.messages.push(demoAssistantResponse);
          currentChatSession.updated_at = new Date();
        }
        onMessageSentOrUploaded();

    } catch (error) {
      console.error('DEMO MODE: Simulated error in send message:', error);
      const errorMessage = `Demo Error: Failed to simulate chat response. ${error.message || 'Please try again.'}`;
      const errorMsgObj = createDemoMessage('assistant', errorMessage, 'error');
      setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), errorMsgObj]);

      if (currentChatSession) {
        currentChatSession.messages.push(userMessageForChat);
        currentChatSession.messages.push(errorMsgObj);
        currentChatSession.updated_at = new Date();
      }
      onMessageSentOrUploaded();
    } finally {
      setIsLoading(false);
    }
  };


  // Determine if send button should be disabled
  const isSendDisabled = isLoading || !currentChatSession?.id || (
    uploadStep === 'welcome'
  ) || (
    uploadStep === 'awaiting_invoice'
  ) || (
    uploadStep === 'chatting' && inputMessage.trim() === ''
  );

  return (
    <div className="flex-grow flex flex-col bg-gray-100 rounded-lg p-4 shadow-xl ml-4 mr-4 mb-4">
      <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-4 rounded-lg bg-white border border-gray-200">
        {messages.map((msg, index) => (
          <MessageBubble
            key={msg.id || index}
            message={msg.message}
            role={msg.role}
            timestamp={msg.timestamp}
            type={msg.type}
            payload={msg.payload}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="mt-4 flex items-center space-x-2 bg-white p-3 rounded-lg shadow-xl border border-gray-200">
        {currentChatSession?.id && (uploadStep === 'awaiting_invoice' || uploadStep === 'chatting') && (
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="p-3 rounded-full bg-custom-red text-white hover:bg-custom-red-dark transition-colors shadow-md flex items-center justify-center"
            title="Attach Documents"
            disabled={isLoading}
          >
            <Paperclip className="h-5 w-5" />
          </button>
        )}

        <input
          type="text"
          value={inputMessage}
          onChange={(e) => e.target.value.length <= 500 && setInputMessage(e.target.value)}
          placeholder={
            !currentChatSession ? 'Click "New Chat" on the sidebar to begin...' :
            uploadStep === 'welcome' ? 'Click "New Chat" on the sidebar to begin...' :
            uploadStep === 'awaiting_invoice' ? 'Click the paperclip to upload your invoice.' :
            'Ask a follow-up question...'
          }
          className="flex-grow p-3 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-custom-red border border-gray-300 shadow-sm"
          disabled={!currentChatSession?.id || isLoading || uploadStep === 'welcome' || uploadStep === 'awaiting_invoice'}
        />
        {inputMessage.length > 0 && (
            <span className="text-gray-500 text-xs mr-2">
                {inputMessage.length}/500
            </span>
        )}

        <button
          type="submit"
          className="p-3 rounded-lg bg-custom-red text-white hover:bg-custom-red-dark transition-colors shadow-md flex items-center justify-center"
          disabled={isSendDisabled}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>

      <UploadModal
        show={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleModalUploadAndClose}
      />
    </div>
  );
}

export default ChatWindow;


// frontend/src/demo.js

// Helper to create a unique-ish ID for demo purposes
export const generateDemoId = () => `demo-${Math.random().toString(36).substring(2, 11)}`;

// Helper function to create a basic chat message structure
export const createDemoMessage = (role, message, type = null, payload = {}) => ({
  role,
  message,
  timestamp: new Date(),
  type,
  payload,
});

// --- Demo Invoice Data Structures ---
const acceptedInvoiceData = {
  supplier_details: { name: "Demo Supplier Inc.", address: "123 Demo St, Demo City", gstin: "24AAAGP0685F1ZH" },
  invoice_number: "INV-DEMO-001",
  invoice_date: "2023-10-26",
  recipient_details: { name: "Demo Recipient Co.", address: "456 Test Ave, Test Town", gstin: "27BBBFF2365E1ZE" },
  delivery_address: "789 Ship Blvd, Ship City",
  hsn_sac_code: "123456",
  quantity_code: "QTY-A",
  total_value_of_supply: 1500.00,
  taxable_value_of_supply: 1500.00,
  tax_rate: "18%",
  amount_of_tax_charged: 270.00,
  place_of_supply: "Karnataka (29)",
  delivery_address_different: "Yes",
  tax_payable_on_reverse_charge: "No",
  manual_digital_signature: "Present",
  remarks: "This is a demo accepted invoice.",
  po_number_extracted: "PO-XYZ-123",
  bond_lut_number: "",
  items: [
    { description: "Item A", quantity: 2, unit_price: 500.00, total_line_amount: 1000.00, item_tax_rate: "18%", item_amount_of_tax_charged: 180.00 },
    { description: "Item B", quantity: 1, unit_price: 500.00, total_line_amount: 500.00, item_tax_rate: "18%", item_amount_of_tax_charged: 90.00 },
  ],
};

const acceptedPoData = {
  supplier_details: { name: "Demo Supplier Inc.", address: "123 Demo St, Demo City", gstin: "24AAAGP0685F1ZH" },
  po_number: "PO-XYZ-123",
  po_date: "2023-10-20",
  invoice_number: "INV-DEMO-001", // PO might reference invoice number
  invoice_date: "2023-10-26",     // PO might reference invoice date
  recipient_details: { name: "Demo Recipient Co.", address: "456 Test Ave, Test Town", gstin: "27BBBFF2365E1ZE" },
  delivery_address: "789 Ship Blvd, Ship City",
  hsn_sac_code: "123456",
  quantity_code: "QTY-A",
  total_value_of_supply: 1500.00,
  taxable_value_of_supply: 1500.00,
  tax_rate: "18%",
  amount_of_tax_charged: 270.00,
  place_of_supply: "Karnataka (29)",
  delivery_address_different: "Yes",
  tax_payable_on_reverse_charge: "No",
  manual_digital_signature: "Present",
  remarks: "PO for Demo Invoice 001",
  bond_lut_number: "",
  items: [
    { description: "Item A", quantity: 2, unit_price: 500.00, total_line_amount: 1000.00, item_tax_rate: "18%", item_amount_of_tax_charged: 180.00 },
    { description: "Item B", quantity: 1, unit_price: 500.00, total_line_amount: 500.00, item_tax_rate: "18%", item_amount_of_tax_charged: 90.00 },
  ],
  total_amount: 1770.00, // Total including taxes
};

const rejectedInvoiceData = {
  supplier_details: { name: "Risky Vendor LLC", address: "100 Unknown Rd", gstin: "" }, // Missing GSTIN
  invoice_number: "", // Missing invoice number
  invoice_date: "2023-01-01",
  recipient_details: { name: "Recipient XYZ", address: "Anywhere", gstin: "" }, // Missing GSTIN
  delivery_address: "",
  hsn_sac_code: "", // Missing HSN/SAC
  quantity_code: "",
  total_value_of_supply: 900.00,
  taxable_value_of_supply: 900.00,
  tax_rate: "5%",
  amount_of_tax_charged: 45.00,
  place_of_supply: "", // Missing place of supply
  delivery_address_different: "No",
  tax_payable_on_reverse_charge: "No",
  manual_digital_signature: "Absent", // Missing signature
  remarks: "This invoice needs review.",
  po_number_extracted: "",
  bond_lut_number: "", // Missing BOND/LUT
  items: [ // Missing required fields in item 1
    { description: "Service X", quantity: 1, unit_price: 900.00, total_line_amount: 900.00, item_tax_rate: "", item_amount_of_tax_charged: 0.00 },
  ],
};

const rejectedInvoiceIssues = {
  "invoice_number": "Missing required field: Invoice No - Consecutive Serial Number",
  "recipient_details.gstin": "Invalid GSTIN format for Name, address and GSTIN of recipient, if recipient registered: ''",
  "hsn_sac_code": "Missing required field: HSN/SAC Code",
  "place_of_supply": "Missing required field: Place of supply - State name and State code",
  "manual_digital_signature": "Manual Signature or digital signature of supplier or his authorised signatory should be 'Present' but was 'Absent'",
  "bond_lut_number": "Missing required field: BOND/LUT No.",
  "items.item_0.item_tax_rate": "Item 1: 'Item Tax Rate' format invalid (expected X%): ''.",
  "items.item_0.item_amount_of_tax_charged": "Item 1: Missing required field 'Item Amount Of Tax Charged'."
};

const poMismatchInvoiceData = {
  supplier_details: { name: "Invoice Corp", address: "Inv Address", gstin: "24AAAAA1111A1Z1" },
  invoice_number: "INV-002",
  invoice_date: "2023-11-01",
  recipient_details: { name: "Client A", address: "Client Address", gstin: "27BBBBB2222B2Z2" },
  delivery_address: "Client Ship Address",
  hsn_sac_code: "7890",
  quantity_code: "UNIT",
  total_value_of_supply: 1000.00,
  taxable_value_of_supply: 1000.00,
  tax_rate: "10%",
  amount_of_tax_charged: 100.00,
  place_of_supply: "Maharashtra (27)",
  delivery_address_different: "Yes",
  tax_payable_on_reverse_charge: "No",
  manual_digital_signature: "Present",
  remarks: "Standard invoice.",
  po_number_extracted: "PO-A-123",
  bond_lut_number: "BOND123",
  items: [
    { description: "Product X", quantity: 5, unit_price: 200.00, total_line_amount: 1000.00, item_tax_rate: "10%", item_amount_of_tax_charged: 100.00 },
  ],
};

const poMismatchPoData = {
  supplier_details: { name: "PO Company", address: "PO Address", gstin: "24AAAAA1111A1Z1" }, // Name Mismatch
  po_number: "PO-A-123",
  po_date: "2023-10-25",
  invoice_number: "INV-002-MISMATCH", // Invoice Number Mismatch
  invoice_date: "2023-11-01",
  bond_lut_number: "BOND456", // Bond/LUT Mismatch
  recipient_details: { name: "Client A", address: "Client Address", gstin: "27BBBBB2222B2Z2" },
  delivery_address: "Client Ship Address",
  hsn_sac_code: "7890",
  quantity_code: "UNIT",
  total_value_of_supply: 950.00, // Total Value Mismatch
  taxable_value_of_supply: 950.00,
  tax_rate: "12%", // Tax Rate Mismatch
  amount_of_tax_charged: 114.00,
  place_of_supply: "Maharashtra (27)",
  delivery_address_different: "Yes",
  tax_payable_on_reverse_charge: "No",
  manual_digital_signature: "Present",
  remarks: "PO for Product X.",
  items: [
    { description: "Product X", quantity: 5, unit_price: 190.00, total_line_amount: 950.00, item_tax_rate: "12%", item_amount_of_tax_charged: 114.00 }, // Line item price mismatch
  ],
  total_amount: 1064.00,
};

const poMismatchResults = {
  overall_match: false,
  matched_fields: {
    "Invoice:invoice_date vs PO:invoice_date": "2023-11-01",
    "Invoice:recipient_details.name vs PO:recipient_details.name": "Client A",
    "Invoice:recipient_details.address vs PO:recipient_details.address": "Client Address",
    "Invoice:recipient_details.gstin vs PO:recipient_details.gstin": "27BBBBB2222B2Z2",
    "Invoice:delivery_address vs PO:delivery_address": "Client Ship Address",
    "Invoice:hsn_sac_code vs PO:hsn_sac_code": "7890",
    "Invoice:quantity_code vs PO:quantity_code": "UNIT",
    "Invoice:place_of_supply vs PO:place_of_supply": "Maharashtra (27)",
    "Invoice:delivery_address_different vs PO:delivery_address_different": "Yes",
    "Invoice:tax_payable_on_reverse_charge vs PO:tax_payable_on_reverse_charge": "No",
    "Invoice:manual_digital_signature vs PO:manual_digital_signature": "Present",
    "Invoice:remarks vs PO:remarks": "Standard invoice.",
  },
  mismatched_fields: {
    "Invoice:supplier_details.name vs PO:supplier_details.name": {
      invoice_value: "Invoice Corp",
      po_value: "PO Company",
    },
    "Invoice:invoice_number vs PO:invoice_number": {
      invoice_value: "INV-002",
      po_value: "INV-002-MISMATCH",
    },
    "Invoice:bond_lut_number vs PO:bond_lut_number": {
      invoice_value: "BOND123",
      po_value: "BOND456",
    },
    "Invoice:total_value_of_supply vs PO:total_value_of_supply": {
      invoice_value: 1000.00,
      po_value: 950.00,
    },
    "Invoice:tax_rate vs PO:tax_rate": {
      invoice_value: "10%",
      po_value: "12%",
    },
    line_item_details: [
      {
        type: "item_value_mismatch",
        item_index: 0,
        mismatches: {
          unit_price: {
            invoice_value: 200.00,
            po_value: 190.00,
            issue: "value_mismatch",
          },
          total_line_amount: {
            invoice_value: 1000.00,
            po_value: 950.00,
            issue: "value_mismatch",
          },
        },
      },
    ],
  },
  missing_in_invoice: [],
  missing_in_po: [],
};


// --- Define Demo Chat Sessions ---
export const demoChatSessions = [
  {
    id: generateDemoId(),
    invoice_result_id: generateDemoId(),
    title: "Accepted Invoice (No PO)",
    created_at: new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    updated_at: new Date(new Date().getTime() - 3 * 24 * 60 * 60 * 1000),
    messages: [
      createDemoMessage('user', 'Here is an invoice for validation.'),
      createDemoMessage(
        'assistant',
        'Invoice processing initiated successfully. Here is the detailed report.',
        'validation_result',
        {
          status: "accepted",
          message: "Invoice successfully validated.",
          invoice_result_id: generateDemoId(),
          result_summary: {
            invoice_number: acceptedInvoiceData.invoice_number,
            overall_invoice_validation_status: "Accepted",
            invoice_validation_issues: {},
            overall_po_comparison_status: "N/A (No PO Provided)",
            po_comparison_results: { overall_match: true, message: "PO comparison skipped, no PO provided." },
            extracted_invoice_fields: acceptedInvoiceData,
            selected_checklist_option: "option_2_with_igst",
            vendor_check_result: { is_listed_vendor: true, message: "Supplier 'Demo Supplier Inc.' is a listed vendor." },
            summary_message: "Invoice validated successfully against checklist requirements.",
          },
        }
      ),
    ],
  },
  {
    id: generateDemoId(),
    invoice_result_id: generateDemoId(),
    title: "Invoice & PO Match (Accepted)",
    created_at: new Date(new Date().getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    updated_at: new Date(new Date().getTime() - 2 * 24 * 60 * 60 * 1000),
    messages: [
      createDemoMessage('user', 'Please validate this invoice and compare it with the attached PO.'),
      createDemoMessage('user', 'accepted_invoice_match_po.pdf', 'file_upload', { file_name: 'accepted_invoice_match_po.pdf' }),
      createDemoMessage('user', 'accepted_po_match_invoice.pdf', 'file_upload', { file_name: 'accepted_po_match_invoice.pdf' }),
      createDemoMessage(
        'assistant',
        'Invoice and PO processed. All details match.',
        'validation_result',
        {
          status: "accepted",
          message: "Invoice successfully validated and matched with PO.",
          invoice_result_id: generateDemoId(),
          result_summary: {
            invoice_number: acceptedInvoiceData.invoice_number,
            overall_invoice_validation_status: "Accepted",
            invoice_validation_issues: {},
            overall_po_comparison_status: "Accepted",
            po_comparison_results: { overall_match: true, message: "All compared fields match.", matched_fields: {}, mismatched_fields: {}, missing_in_invoice: [], missing_in_po: [] },
            extracted_invoice_fields: acceptedInvoiceData,
            extracted_po_data: acceptedPoData,
            selected_checklist_option: "option_2_with_igst",
            vendor_check_result: { is_listed_vendor: true, message: "Supplier 'Demo Supplier Inc.' is a listed vendor." },
            summary_message: "Invoice and PO successfully validated and matched.",
          },
        }
      ),
    ],
  },
  {
    id: generateDemoId(),
    invoice_result_id: generateDemoId(),
    title: "Rejected Invoice (Validation Issues)",
    created_at: new Date(new Date().getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    updated_at: new Date(new Date().getTime() - 1 * 24 * 60 * 60 * 1000),
    messages: [
      createDemoMessage('user', 'I need this invoice validated. No PO is available.'),
      createDemoMessage('user', 'rejected_invoice.png', 'file_upload', { file_name: 'rejected_invoice.png' }),
      createDemoMessage(
        'assistant',
        'Invoice processing completed with issues. Please review the report.',
        'validation_result',
        {
          status: "rejected",
          message: "Invoice failed validation.",
          invoice_result_id: generateDemoId(),
          result_summary: {
            invoice_number: rejectedInvoiceData.invoice_number,
            overall_invoice_validation_status: "Rejected",
            invoice_validation_issues: rejectedInvoiceIssues,
            overall_po_comparison_status: "N/A (No PO Provided)",
            po_comparison_results: { overall_match: true, message: "PO comparison skipped, no PO provided." },
            extracted_invoice_fields: rejectedInvoiceData,
            selected_checklist_option: "option_3_unauthorized",
            vendor_check_result: { is_listed_vendor: false, message: "Supplier 'Risky Vendor LLC' is NOT a listed vendor." },
            summary_message: "Invoice failed validation due to missing required fields and format issues.",
          },
        }
      ),
    ],
  },
  {
    id: generateDemoId(),
    invoice_result_id: generateDemoId(),
    title: "Rejected (PO Mismatches)",
    created_at: new Date(new Date().getTime() - 0.5 * 24 * 60 * 60 * 1000), // Half day ago
    updated_at: new Date(new Date().getTime() - 0.5 * 24 * 60 * 60 * 1000),
    messages: [
      createDemoMessage('user', 'Here are an invoice and its PO for comparison.'),
      createDemoMessage('user', 'po_mismatch_invoice.pdf', 'file_upload', { file_name: 'po_mismatch_invoice.pdf' }),
      createDemoMessage('user', 'po_mismatch_po.pdf', 'file_upload', { file_name: 'po_mismatch_po.pdf' }),
      createDemoMessage(
        'assistant',
        'Invoice and PO comparison found mismatches. Please check the report.',
        'validation_result',
        {
          status: "rejected",
          message: "Invoice did not match PO.",
          invoice_result_id: generateDemoId(),
          result_summary: {
            invoice_number: poMismatchInvoiceData.invoice_number,
            overall_invoice_validation_status: "Accepted", // Invoice itself is valid
            invoice_validation_issues: {},
            overall_po_comparison_status: "Rejected",
            po_comparison_results: poMismatchResults,
            extracted_invoice_fields: poMismatchInvoiceData,
            extracted_po_data: poMismatchPoData,
            selected_checklist_option: "option_2_with_igst",
            vendor_check_result: { is_listed_vendor: true, message: "Supplier 'Invoice Corp' is a listed vendor." },
            summary_message: "PO comparison revealed several discrepancies between the invoice and purchase order.",
          },
        }
      ),
    ],
  },
];
