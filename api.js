// frontend/src/components/ChatWindow.jsx (API-Driven Modal Integration)

import React, { useState, useEffect, useRef, useCallback } from 'react'; // Import useCallback
import { Paperclip, Send, Loader2 } from 'lucide-react'; // Icons for attach, send, loading
import { uploadInvoice, sendChatQuery, addMessageToSession } from '../api'; // Import new API functions
import MessageBubble from './MessageBubble'; // Import the MessageBubble component
import UploadModal from './UploadModal'; // Import the new UploadModal
import DetailModal from './DetailModal'; // NEW: Import the new DetailModal component

// Removed isDemoMode prop as this ChatWindow is API-driven now
function ChatWindow({ currentChatSession, onMessageSentOrUploaded }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStep, setUploadStep] = useState('welcome'); // 'welcome', 'awaiting_invoice', 'chatting'
  const [currentInvoiceResultId, setCurrentInvoiceResultId] = useState(null); // Stores the invoice_result_id for the current session
  const [showUploadModal, setShowUploadModal] = useState(false); // State to control upload modal visibility

  // NEW: State for the Detailed View Modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedInvoiceIdForModal, setSelectedInvoiceIdForModal] = useState(null);

  const messagesEndRef = useRef(null); // Ref for auto-scrolling chat to bottom

  // --- Effect to load messages and set uploadStep when currentChatSession changes ---
  useEffect(() => {
    console.log('ChatWindow useEffect: currentChatSession changed to:', currentChatSession);
    setInputMessage('');

    if (currentChatSession) {
      // Load messages from the selected session
      setMessages(currentChatSession.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp), // Ensure Date object
      })));
      setCurrentInvoiceResultId(currentChatSession.invoice_result_id || null);
      
      // Determine upload step based on whether an invoice result already exists
      if (currentChatSession.invoice_result_id) {
        setUploadStep('chatting'); // Session already has an invoice result, can chat
      } else {
        // New session (no invoice_result_id yet): Display initial welcome messages and prompt for invoice.
        // These are persisted to the backend here.
        const initialWelcomeMessages = [
          {
            role: 'assistant',
            message: "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.",
            timestamp: new Date(),
            type: 'initial_welcome',
            payload: {} // Ensure payload is always present
          },
          {
            role: 'assistant',
            message: 'Please upload your invoice document to get started using the paperclip icon below.',
            timestamp: new Date(),
            type: 'prompt_upload_invoice',
            payload: {} // Ensure payload is always present
          },
        ];
        setMessages(initialWelcomeMessages);
        setUploadStep('awaiting_invoice');

        // Persist these initial messages to the newly created session
        const persistInitialMessages = async () => {
          if (currentChatSession.id) { // Only persist if session ID is available
            try {
              // Add a small delay to ensure backend has fully registered the new session ID
              await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
              await addMessageToSession(currentChatSession.id, initialWelcomeMessages[0]);
              await addMessageToSession(currentChatSession.id, initialWelcomeMessages[1]);
              console.log("Initial welcome messages persisted for new session:", currentChatSession.id);
            } catch (error) {
              console.error("Failed to persist initial welcome messages:", error);
            }
          }
        };
        // Only call persistInitialMessages if currentChatSession.messages does NOT already contain these messages
        // This prevents double-saving if the effect runs multiple times due to other state changes
        if (!currentChatSession.messages.some(msg => msg.type === 'initial_welcome')) {
          persistInitialMessages();
        }
      }

    } else {
      // No session selected or active (initial app load or sidebar cleared)
      setMessages([
        {
          role: 'assistant',
          message: "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.",
          timestamp: new Date(),
          type: 'initial_welcome',
          payload: {}
        },
        {
          role: 'assistant',
          message: 'Please click "New Chat" on the sidebar to get started or select an existing session.',
          timestamp: new Date(),
          type: 'prompt_to_start',
          payload: {}
        },
      ]);
      setUploadStep('welcome'); // Set to welcome state if no session is active
      setCurrentInvoiceResultId(null);
    }
  }, [currentChatSession, addMessageToSession]); // Dependency on addMessageToSession (from App.jsx useCallback)

  // Auto-scroll to bottom of messages whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // NEW: Callback to open the detailed view modal
  const handleOpenDetailsModal = useCallback((invoiceResultId) => {
    setSelectedInvoiceIdForModal(invoiceResultId);
    setShowDetailModal(true);
  }, []);

  // NEW: Callback to close the detailed view modal
  const handleCloseDetailsModal = useCallback(() => {
    setShowDetailModal(false);
    setSelectedInvoiceIdForModal(null);
  }, []);


  // --- Handle Upload from Modal (API-driven) ---
  const handleModalUploadAndClose = async (invoiceFile, poFile, hasPo) => {
    setShowUploadModal(false); // Close the modal

    if (!currentChatSession?.id) {
        console.error("handleModalUploadAndClose: No active session ID found. currentChatSession:", currentChatSession);
        return;
    }

    setIsLoading(true);

    const userMessageContent = poFile 
        ? `Uploaded Invoice: ${invoiceFile.name}, PO: ${poFile.name}`
        : `Uploaded Invoice: ${invoiceFile.name} (No PO)`;
    
    const userMessageForBackend = {
        role: 'user',
        message: userMessageContent,
        timestamp: new Date(),
        type: 'file_upload',
        payload: { invoiceFileName: invoiceFile.name, poFileName: poFile?.name || null }
    };

    setMessages(prev => [...prev, userMessageForBackend]);
    try {
        await addMessageToSession(currentChatSession.id, userMessageForBackend);

        setMessages(prev => [...prev, { role: 'assistant', message: 'Processing your documents...', timestamp: new Date(), type: 'loading_indicator', payload: {} }]);
        
        console.log('handleModalUploadAndClose: Calling uploadInvoice with Session ID:', currentChatSession.id);
        const result = await uploadInvoice(currentChatSession.id, invoiceFile, poFile, hasPo);
        
        const assistantResponseText = result.message || 'Documents processed! Here are the results.';
        const assistantPayload = {
            ...result.result_summary, // Ensure result_summary is spread here
            invoice_result_id: result.invoice_result_id
        };

        const finalAssistantMessage = {
            role: 'assistant',
            message: assistantResponseText,
            timestamp: new Date(),
            type: 'validation_result', // This type directly indicates a validation summary
            payload: assistantPayload,
        };
        setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), finalAssistantMessage]);
        await addMessageToSession(currentChatSession.id, finalAssistantMessage);

        setCurrentInvoiceResultId(result.invoice_result_id);
        onMessageSentOrUploaded(); // Trigger history refresh in App.jsx
        setUploadStep('chatting'); // Transition to general chat mode

    } catch (error) {
        console.error('Error during document upload from modal:', error);
        const errorMessage = `Error processing documents: ${error.message || 'Something went wrong. Please try again.'}`;
        const errorMsgObj = {
            role: 'assistant',
            message: errorMessage,
            timestamp: new Date(),
            type: 'error',
            payload: {}
        };
        setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), errorMsgObj]);
        if (currentChatSession?.id) {
            await addMessageToSession(currentChatSession.id, errorMsgObj);
            onMessageSentOrUploaded();
        }
    } finally {
        setIsLoading(false);
    }
  };


  // --- Message Sending Logic (now primarily for text chat) ---
  const handleSendMessage = async (event) => {
    event.preventDefault();

    if (!currentChatSession?.id || isLoading) {
      console.warn("Cannot send message: No active session ID or still loading.");
      return;
    }

    const trimmedInputMessage = inputMessage.trim();
    
    // Only proceed if there's a message and we are in 'chatting' mode
    if (uploadStep !== 'chatting' || trimmedInputMessage === '') {
        console.warn("Attempted to send, but not in chat mode or message is empty.");
        return;
    }

    setIsLoading(true);
    setInputMessage('');

    const userMessageForBackend = {
        role: 'user',
        message: trimmedInputMessage,
        timestamp: new Date(),
        type: 'text_message',
        payload: {}
    };

    setMessages(prev => [...prev, userMessageForBackend]);
    
    try {
      await addMessageToSession(currentChatSession.id, userMessageForBackend);

      setMessages(prev => [...prev, { role: 'assistant', message: 'Thinking...', timestamp: new Date(), type: 'loading_indicator', payload: {} }]);
      const result = await sendChatQuery(trimmedInputMessage, currentChatSession.id, currentInvoiceResultId);
      
      const assistantResponseText = result.response;
      const assistantPayload = {}; // Chat responses don't usually have a complex payload

      const finalAssistantMessage = {
        role: 'assistant',
        message: assistantResponseText,
        timestamp: new Date(),
        type: 'text_message',
        payload: assistantPayload,
      };
      setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), finalAssistantMessage]);
      await addMessageToSession(currentChatSession.id, finalAssistantMessage);

      onMessageSentOrUploaded(); // Refresh sidebar

    } catch (error) {
      console.error('Error in send message:', error);
      const errorMessage = `Error: ${error.message || 'Something went wrong. Please try again.'}`;
      const errorMsgObj = {
        role: 'assistant',
        message: errorMessage,
        timestamp: new Date(),
        type: 'error',
        payload: {}
      };
      setMessages(prev => [...prev.filter(m => m.type !== 'loading_indicator'), errorMsgObj]);
      if (currentChatSession?.id) {
          await addMessageToSession(currentChatSession.id, errorMsgObj);
          onMessageSentOrUploaded();
      }
    } finally {
      setIsLoading(false);
    }
  };


  // Determine if send button should be disabled
  const isSendDisabled = isLoading || !currentChatSession?.id || (
    uploadStep === 'welcome'
  ) || (
    uploadStep === 'awaiting_invoice' // Cannot send an empty message here, must use paperclip
  ) || (
    uploadStep === 'chatting' && inputMessage.trim() === '' // Only disable if chatting and message is empty
  );

  return (
    <div className="flex-grow flex flex-col bg-gray-100 rounded-lg p-4 shadow-xl ml-4 mr-4 mb-4">
      {/* Chat Messages Display */}
      <div className="flex-grow overflow-y-auto custom-scrollbar p-4 space-y-4 rounded-lg bg-white border border-gray-200">
        {messages.map((msg, index) => (
          <MessageBubble
            key={msg.id || index}
            message={msg.message}
            role={msg.role}
            timestamp={msg.timestamp}
            type={msg.type}
            payload={msg.payload}
            onOpenDetails={handleOpenDetailsModal} // Pass the new callback to MessageBubble
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSendMessage} className="mt-4 flex items-center space-x-2 bg-white p-3 rounded-lg shadow-xl border border-gray-200">
        {/* Attach File Button - Opens the modal */}
        {currentChatSession?.id && (uploadStep === 'awaiting_invoice' || uploadStep === 'chatting') && ( // Show in specific steps
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

        {/* Query Input */}
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={
            !currentChatSession ? 'Click "New Chat" on the sidebar to begin...' :
            uploadStep === 'welcome' ? 'Click "New Chat" on the sidebar to begin...' :
            uploadStep === 'awaiting_invoice' ? 'Click the paperclip to upload your invoice.' :
            'Ask a follow-up question...'
          }
          className="flex-grow p-3 rounded-lg bg-gray-50 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-custom-red border border-gray-300 shadow-sm"
          disabled={!currentChatSession?.id || isLoading || uploadStep === 'welcome' || uploadStep === 'awaiting_invoice'} // Disable text input in invoice upload step
        />

        {/* Send Button */}
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

      {/* Upload Modal */}
      <UploadModal
        show={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleModalUploadAndClose}
      />

      {/* NEW: Detail Modal */}
      <DetailModal
        show={showDetailModal}
        onClose={handleCloseDetailsModal}
        invoiceResultId={selectedInvoiceIdForModal}
      />
    </div>
  );
}

export default ChatWindow;


// frontend/src/components/DetailModal.jsx

import React from 'react';
import { X } from 'lucide-react'; // Import the X icon for closing
import ValidationDetailView from './ValidationDetailView'; // Import the view to be displayed in the modal

function DetailModal({ show, onClose, invoiceResultId }) {
  // If show is false, render nothing
  if (!show) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors z-10"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header (Optional, but good for title) */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800">Detailed Validation Report</h2>
        </div>

        {/* Modal Body: Where ValidationDetailView content goes. Make it scrollable. */}
        <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
          {/* Render ValidationDetailView inside the modal, passing the invoiceResultId */}
          <ValidationDetailView invoiceResultId={invoiceResultId} />
        </div>
      </div>
    </div>
  );
}

export default DetailModal;
// frontend/src/components/MessageBubble.jsx (Validation Result Summary & Details Button - Modal Trigger)

import React from 'react';
import { CheckCircle, XCircle, Info, FileText, Loader2 } from 'lucide-react'; // Added Loader2 icon
// Removed useNavigate as we are no longer navigating to a new route
// import { useNavigate } from 'react-router-dom'; 

// Added onOpenDetails prop to trigger the modal
function MessageBubble({ message, role, timestamp, type, payload, onOpenDetails }) {
  const isUser = role === 'user';
  const bubbleClasses = isUser
    ? 'bg-custom-red text-white ml-auto rounded-br-none'
    : 'bg-white text-gray-800 mr-auto rounded-bl-none border border-gray-200 shadow-md';

  const timestampClasses = isUser ? 'text-gray-200' : 'text-gray-500';

  // Function to open the details modal
  const handleOpenDetailsModal = () => {
    // Ensure onOpenDetails callback is provided and payload has the invoice_result_id
    if (type === 'validation_result' && payload && payload.invoice_result_id && onOpenDetails) {
      onOpenDetails(payload.invoice_result_id); // Call the prop function, passing the ID
    } else {
      console.warn("Cannot open details modal: invoice_result_id is missing from payload, message type is not 'validation_result', or onOpenDetails callback is missing.");
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
        {/* Corrected logic for 'prompt_upload_po' and 'loading_indicator' */}
        {type === 'prompt_upload_po' && ( 
          <div className="flex items-center text-md font-medium mb-1">
            <Info className="h-5 w-5 mr-2" /> 
            {message}
          </div>
        )}
        {type === 'loading_indicator' && (
          <div className="flex items-center text-md font-medium mb-1">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> 
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
            {/* Detailed View Button - Triggers the modal */}
            {payload.invoice_result_id && (
              <button
                onClick={handleOpenDetailsModal} // Now calls the new handler
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
// frontend/src/components/UploadModal.jsx

import React, { useState } from 'react';
import { X, FileText, CheckCircle, Upload as UploadIcon, Info } from 'lucide-react'; // Added Info icon

function UploadModal({ show, onClose, onUpload }) {
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [poFile, setPoFile] = useState(null);
  const [hasPo, setHasPo] = useState(false);
  const [error, setError] = useState('');

  if (!show) {
    return null; // Don't render if not visible
  }

  const handleUploadClick = () => {
    setError(''); // Clear previous errors
    if (!invoiceFile) {
      setError('Please select an invoice file.');
      return;
    }

    if (hasPo && !poFile) {
      setError('You indicated a PO, but no PO file was selected.');
      return;
    }

    onUpload(invoiceFile, hasPo ? poFile : null, hasPo);
    // Reset state after successful upload (or pass this responsibility to parent)
    setInvoiceFile(null);
    setPoFile(null);
    setHasPo(false);
    onClose(); // Close modal after submission
  };

  const handleClose = () => {
    // Optionally reset state on close if you want to clear selections
    setInvoiceFile(null);
    setPoFile(null);
    setHasPo(false);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md relative">
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </button>

        <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Upload Documents</h2>

        {/* Invoice File Input */}
        <div className="mb-4">
          <label htmlFor="invoice-upload" className="block text-gray-700 text-sm font-semibold mb-2">
            Invoice Document (PDF, JPG, PNG): <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center border border-gray-300 rounded-md p-2 bg-gray-50">
            <input
              type="file"
              id="invoice-upload"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                setInvoiceFile(e.target.files[0]);
                setError(''); // Clear error on file selection
              }}
              className="hidden" // Hide default file input
            />
            <button
              type="button"
              onClick={() => document.getElementById('invoice-upload').click()}
              className="flex items-center justify-center px-4 py-2 bg-custom-red text-white rounded-md hover:bg-custom-red-dark transition-colors shadow-sm text-sm"
            >
              <UploadIcon className="h-4 w-4 mr-2" /> Select Invoice
            </button>
            <span className="ml-3 text-gray-600 truncate">
              {invoiceFile ? invoiceFile.name : 'No file selected'}
            </span>
            {invoiceFile && <CheckCircle className="h-5 w-5 text-green-500 ml-auto" />}
          </div>
        </div>

        {/* PO Checkbox */}
        <div className="mb-4">
          <label className="flex items-center text-gray-700 text-sm font-semibold">
            <input
              type="checkbox"
              checked={hasPo}
              onChange={(e) => {
                setHasPo(e.target.checked);
                // Clear PO file if checkbox is unchecked
                if (!e.target.checked) {
                  setPoFile(null);
                }
                setError(''); // Clear error
              }}
              className="mr-2 h-4 w-4 text-custom-red rounded border-gray-300 focus:ring-custom-red"
            />
            I have a Purchase Order (PO) for comparison.
          </label>
        </div>

        {/* PO File Input (Conditional) */}
        {hasPo && (
          <div className="mb-6">
            <label htmlFor="po-upload" className="block text-gray-700 text-sm font-semibold mb-2">
              Purchase Order Document (PDF, JPG, PNG):
            </label>
            <div className="flex items-center border border-gray-300 rounded-md p-2 bg-gray-50">
              <input
                type="file"
                id="po-upload"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  setPoFile(e.target.files[0]);
                  setError(''); // Clear error on file selection
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => document.getElementById('po-upload').click()}
                className="flex items-center justify-center px-4 py-2 bg-custom-red text-white rounded-md hover:bg-custom-red-dark transition-colors shadow-sm text-sm"
              >
                <UploadIcon className="h-4 w-4 mr-2" /> Select PO
              </button>
              <span className="ml-3 text-gray-600 truncate">
                {poFile ? poFile.name : 'No file selected'}
              </span>
              {poFile && <CheckCircle className="h-5 w-5 text-green-500 ml-auto" />}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md flex items-center">
            <Info className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUploadClick}
          className="w-full py-3 bg-custom-red text-white rounded-lg font-semibold hover:bg-custom-red-dark transition-colors shadow-lg flex items-center justify-center"
          disabled={!invoiceFile || (hasPo && !poFile)}
        >
          <UploadIcon className="h-5 w-5 mr-2" /> Upload Documents
        </button>
      </div>
    </div>
  );
}

export default UploadModal;
// frontend/src/components/ValidationDetailView.jsx (API-Driven, Prop-Based ID)

import React, { useState, useEffect } from 'react';
// Removed router hooks as ID now comes from props
// import { useParams, useLocation } from 'react-router-dom'; 
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'; // Icons
import { fetchInvoiceResultDetails } from '../api'; // Import the API function

function ValidationDetailView({ invoiceResultId }) { // Accepts invoiceResultId as a prop
  const [validationData, setValidationData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDetails = async () => {
      if (!invoiceResultId) {
        setError("Invoice Result ID not provided to ValidationDetailView.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        console.log("API MODE: Fetching validation details from backend for ID:", invoiceResultId);
        const data = await fetchInvoiceResultDetails(invoiceResultId);
        setValidationData(data);
        console.log("Fetched validation details:", data);
      } catch (err) {
        console.error("Error loading validation details for ID:", invoiceResultId, ":", err);
        setError(err.message || "Failed to load validation details.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDetails();
  }, [invoiceResultId]); // Reload if ID changes

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
          onClick={() => window.location.reload()} // Simple reload to retry (re-fetches parent data)
          className="px-4 py-2 bg-custom-red text-white rounded-md hover:bg-custom-red-dark transition-colors flex items-center"
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </button>
      </div>
    );
  }

  if (!validationData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700">
        No validation data found for this ID.
      </div>
    );
  }

  const {
    summary,
    extracted_invoice_data,
    invoice_validation_issues,
    extracted_po_data,
    po_comparison_results,
  } = validationData;

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

    // Define the specific keys you want to display for line items
    const lineItemKeysToDisplay = [
      'description', 'quantity', 'unit_price', 'total_line_amount', 
      'item_tax_rate', 'item_amount_of_tax_charged', 'hsn_sac_code', 'quantity_code'
    ];

    return (
      <div key={`${itemPrefix}-item-${index}`} className={`border p-3 rounded-md mb-3 ${itemOverallValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <h4 className="font-semibold mb-2 text-md flex items-center">
          {isInvoiceItem ? "Invoice Item" : "PO Item"} #{index + 1}
          {itemOverallValid ? <CheckCircle className="h-4 w-4 text-green-600 ml-2" /> : <XCircle className="h-4 w-4 text-red-600 ml-2" />}
        </h4>
        {lineItemKeysToDisplay.map(key => { // Iterate over defined keys
          const value = item[key]; // Safely get value from item
          if (value === undefined) return null; // Don't render if key doesn't exist

          const fieldLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          const isMismatched = itemMismatchDetails[key];

          let displayValue = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
          let mismatchNote = '';

          if (isMismatched) {
              displayValue = `Invoice: ${JSON.stringify(isMismatched.invoice_value)}, PO: ${JSON.stringify(isMismatched.po_value)}`;
              mismatchNote = ` (Issue: ${isMismatched.issue?.replace(/_/g, ' ') || 'Mismatch'})`;
          }

          return (
            <p key={`${itemPrefix}-item-${index}-${key}`} className="text-sm">
              <span className="font-medium">{fieldLabel}: </span>
              <span className={`${isMismatched ? 'text-red-600' : ''}`}>
                {displayValue === "" ? "N/A" : displayValue} {/* Handle empty strings */}
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
                
        {/* Detailed PO Mismatches Summary */}
        {po_comparison_results?.mismatched_fields && Object.keys(po_comparison_results.mismatched_fields).length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <h3 className="text-lg font-semibold text-red-700 mb-2">Detailed PO Mismatches:</h3>
                {Object.entries(po_comparison_results.mismatched_fields).map(([field, values]) => {
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
