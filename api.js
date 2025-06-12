// frontend/src/api.js (API Switchboard)

// --- Configuration for API Mode ---
// Set to 'true' for mock API, 'false' for real backend API.
const USE_MOCK_FRONTEND_API = true; 
// --- End Configuration ---

const API_BASE_URL = 'http://127.00.1:8000'; // Real backend URL, only used if USE_MOCK_FRONTEND_API is false

// Import mock API functions if in mock mode
const mockApi = USE_MOCK_FRONTEND_API ? await import('./mockApi.js') : null; // Dynamic import for conditional loading

// Helper function to create a Date object and check its validity (only used by real API path)
const createValidDate = (dateInput) => {
  if (!dateInput) return new Date(); 

  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    console.warn("Invalid date encountered, falling back to current date:", dateInput);
    return new Date();
  }
  return date;
};

// --- API Functions (Conditionally Exported) ---

export const fetchSessions = async () => {
  if (USE_MOCK_FRONTEND_API) {
    console.log("Using Mock API: fetchSessions");
    return mockApi.fetchMockSessions();
  } else {
    console.log("Using Real API: fetchSessions");
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch sessions.');
      }
      const sessions = await response.json();
      return sessions.map(session => ({
        ...session,
        id: session._id ? String(session._id) : String(session.id), 
        created_at: createValidDate(session.created_at), 
        updated_at: createValidDate(session.updated_at),
        messages: session.messages.map(msg => ({
          ...msg,
          timestamp: createValidDate(msg.timestamp), 
        })),
      }));
    } catch (error) {
      console.error('Error fetching sessions:', error);
      throw error;
    }
  }
};

export const createSession = async (title = "New Chat") => {
  if (USE_MOCK_FRONTEND_API) {
    console.log("Using Mock API: createSession");
    return mockApi.createMockSession(title);
  } else {
    console.log("Using Real API: createSession");
    try {
      const response = await fetch(`${API_BASE_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create session.');
      }
      const newSession = await response.json();
      newSession.id = newSession._id ? String(newSession._id) : String(newSession.id); 

      newSession.created_at = createValidDate(newSession.created_at); 
      newSession.updated_at = createValidDate(newSession.updated_at); 
      newSession.messages = newSession.messages.map(msg => ({
        ...msg,
        timestamp: createValidDate(msg.timestamp), 
      }));
      return newSession;
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }
};

export const addMessageToSession = async (sessionId, messageData) => {
  if (USE_MOCK_FRONTEND_API) {
    console.log("Using Mock API: addMessageToSession");
    return mockApi.addMockMessageToSession(sessionId, messageData);
  } else {
    console.log("Using Real API: addMessageToSession");
    if (!sessionId) {
      console.error("addMessageToSession: Session ID is undefined. Cannot add message.");
      throw new Error("Session ID is undefined when trying to add message.");
    }
    try {
      const dataToSend = {
        ...messageData,
        timestamp: messageData.timestamp instanceof Date ? messageData.timestamp.toISOString() : messageData.timestamp,
      };
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || JSON.stringify(errorData) || 'Failed to add message to session.');
      }
      return await response.json();
    } catch (error) {
      console.error(`Error adding message to session ${sessionId}:`, error);
      throw error;
    }
  }
};

export const uploadInvoice = async (sessionId, invoiceFile, poFile, hasPo) => { // Added hasPo parameter
  if (USE_MOCK_FRONTEND_API) {
    console.log("Using Mock API: uploadInvoice");
    return mockApi.uploadMockInvoice(sessionId, invoiceFile, poFile, hasPo);
  } else {
    console.log("Using Real API: uploadInvoice");
    if (!sessionId) {
      console.error("uploadInvoice: Session ID is undefined. Cannot upload invoice.");
      throw new Error("Session ID is undefined when trying to upload invoice.");
    }
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('invoice_file', invoiceFile);
    formData.append('has_po', hasPo ? 'true' : 'false'); 

    if (hasPo && poFile instanceof File) { 
      formData.append('po_file', poFile);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/upload-invoice/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || JSON.stringify(errorData) || 'Failed to upload invoice.');
      }

      return await response.json();
    } catch (error) {
      console.error('Error uploading invoice:', error);
      throw error;
    }
  }
};

export const sendChatQuery = async (message, sessionId, invoiceResultId = null) => {
  if (USE_MOCK_FRONTEND_API) {
    console.log("Using Mock API: sendChatQuery");
    return mockApi.sendMockChatQuery(message, sessionId, invoiceResultId);
  } else {
    console.log("Using Real API: sendChatQuery");
    if (!sessionId) {
      console.error("sendChatQuery: Session ID is undefined. Cannot send chat query.");
      throw new Error("Session ID is undefined when trying to send chat query.");
    }
    try {
      const response = await fetch(`${API_BASE_URL}/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, session_id: sessionId, invoice_result_id: invoiceResultId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || JSON.stringify(errorData) || 'Failed to send chat query.');
      }
      return await response.json();
    } catch (error) {
      console.error('Error sending chat query:', error);
      throw error;
    }
  }
};






























// frontend/src/mockApi.js (Mock Frontend API)

// Helper to create consistent Date objects for mock data
const now = new Date();
const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
const twentyMinutesAgo = new Date(now.getTime() - 20 * 60 * 1000);
const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

// Generate unique-looking IDs for mock sessions and messages
let nextSessionId = 100;
let nextMessageId = 1000;

const generateId = (prefix) => `${prefix}-${Date.now() + Math.random().toString(36).substring(2, 8)}`;

// Mock Invoice Result Data (to be used in validation_result payload)
const mockInvoiceResult1 = {
    "invoice_number": "INV-2023-001-MOCK",
    "overall_invoice_validation_status": "Accepted",
    "invoice_validation_issues": {}, // No issues for this mock
    "overall_po_comparison_status": "Accepted",
    "po_comparison_results": {
        "overall_match": true,
        "matched_fields": {
            "invoice_number": "INV-2023-001-MOCK",
            "total_value_of_supply": 1000.00
        },
        "mismatched_fields": {},
        "missing_in_invoice": [],
        "missing_in_po": []
    },
    "extracted_invoice_fields": {
        "supplier_details": {
            "name": "Lorem Ipsum",
            "address": "Add your bank details",
            "gstin": "27ABCDA1234A1Z5"
        },
        "invoice_number": "INV-2023-001-MOCK",
        "invoice_date": "2023-10-26",
        "recipient_details": {
            "name": "Acme Corp",
            "address": "456 Mock St, Mocktown, MT, 12345",
            "gstin": "09AAMFC0376K1Z4"
        },
        "delivery_address": "",
        "hsn_sac_code": "998311",
        "quantity_code": "1.00",
        "total_value_of_supply": 1000.00,
        "taxable_value_of_supply": 1000.00,
        "tax_rate": "18.00%",
        "amount_of_tax_charged": 180.00,
        "place_of_supply": "Maharashtra (MH - 27)",
        "delivery_address_different": "No",
        "tax_payable_on_reverse_charge": "No",
        "manual_digital_signature": "Present",
        "remarks": "This is a mock invoice for demonstration purposes. LLM bypassed."
    },
    "selected_checklist_option": "option_1_without_igst",
    "summary_message": "Invoice successfully validated against checklist and matches PO. (Mock Data)"
};

const mockInvoiceResult2 = {
    "invoice_number": "INV-2023-002-MOCK",
    "overall_invoice_validation_status": "Rejected",
    "invoice_validation_issues": {
        "remarks": "Missing required field: Remarks on Invoice (Mock)",
        "hsn_sac_code": "Missing required field: HSN/SAC Code (Mock)"
    },
    "overall_po_comparison_status": "Rejected",
    "po_comparison_results": {
        "overall_match": false,
        "matched_fields": {
            "invoice_number": "INV-2023-002-MOCK"
        },
        "mismatched_fields": {
            "total_value_of_supply": {
                "invoice_value": 1500.00,
                "po_value": 1200.00
            }
        },
        "missing_in_invoice": ["supplier_details.gstin"],
        "missing_in_po": []
    },
    "extracted_invoice_fields": {
        "supplier_details": {
            "name": "Global Supplies Inc.",
            "address": "456 Commerce Road, Townsville, ST, 67890",
            "gstin": ""
        },
        "invoice_number": "INV-2023-002-MOCK",
        "invoice_date": "2023-11-01",
        "recipient_details": {
            "name": "Beta Enterprises",
            "address": "789 Industry Ln, City, ST, 54321",
            "gstin": "12ABCDE1234F1Z6"
        },
        "total_value_of_supply": 1500.00,
        "remarks": "" // Missing field
    },
    "selected_checklist_option": "option_2_with_igst",
    "summary_message": "Invoice failed checklist validation due to missing or invalid fields. Invoice does not match PO. See comparison details for discrepancies. (Mock Data)"
};

const mockInvoiceResult3NoPo = {
    "invoice_number": "INV-2023-003-MOCK",
    "overall_invoice_validation_status": "Accepted",
    "invoice_validation_issues": {},
    "overall_po_comparison_status": "N/A (No PO Provided)",
    "po_comparison_results": {
        "overall_match": true, // Always true if no PO
        "message": "PO comparison skipped, no PO provided."
    },
    "extracted_invoice_fields": {
        "supplier_details": {
            "name": "Vendor Solutions Ltd.", // Matches default_vendors list
            "address": "789 Industrial Drive, Metro City, State, 10112",
            "gstin": "10AAMFC0376K1Z7"
        },
        "invoice_number": "INV-2023-003-MOCK",
        "invoice_date": "2023-12-05",
        "recipient_details": {
            "name": "Delta Corporation",
            "address": "101 Tech Way, Techville, CA, 90210",
            "gstin": "06AAMFC0376K1Z8"
        },
        "total_value_of_supply": 500.00,
        "taxable_value_of_supply": 500.00,
        "tax_rate": "0.00%",
        "amount_of_tax_charged": 0.00,
        "place_of_supply": "California (CA - 06)",
        "manual_digital_signature": "Present",
        "remarks": "This invoice processed without a PO. (Mock Data)"
    },
    "selected_checklist_option": "option_1_without_igst",
    "summary_message": "Invoice passed checklist validation. PO comparison skipped, no PO provided. (Mock Data)"
};


// Predefined mock chat sessions
let mockSessions = [
    {
        id: generateId('session'),
        title: "Invoice #INV-2023-001 (Accepted)",
        created_at: thirtyMinutesAgo,
        updated_at: fiveMinutesAgo,
        invoice_result_id: generateId('result'),
        messages: [
            { id: generateId('msg'), role: 'assistant', message: "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.", timestamp: thirtyMinutesAgo, type: 'initial_welcome', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: 'Please upload your invoice document and Purchase Order (PO) to get started. You can attach them using the paperclip icon below, or choose to proceed without a PO.', timestamp: new Date(thirtyMinutesAgo.getTime() + 100), type: 'prompt_upload_invoice', payload: {} },
            { id: generateId('msg'), role: 'user', message: "Uploaded Invoice: invoice_001.pdf, PO: po_001.pdf", timestamp: twentyMinutesAgo, type: 'file_upload', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: "Documents processed! Here are the results.", timestamp: fifteenMinutesAgo, type: 'validation_result', payload: mockInvoiceResult1 },
            { id: generateId('msg'), role: 'user', message: "What is the invoice number?", timestamp: tenMinutesAgo, type: 'text_message', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: "The invoice number is INV-2023-001-MOCK.", timestamp: fiveMinutesAgo, type: 'text_message', payload: {} },
        ]
    },
    {
        id: generateId('session'),
        title: "Invoice #INV-2023-002 (Rejected)",
        created_at: fifteenMinutesAgo,
        updated_at: now,
        invoice_result_id: generateId('result'),
        messages: [
            { id: generateId('msg'), role: 'assistant', message: "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.", timestamp: fifteenMinutesAgo, type: 'initial_welcome', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: 'Please upload your invoice document and Purchase Order (PO) to get started. You can attach them using the paperclip icon below, or choose to proceed without a PO.', timestamp: new Date(fifteenMinutesAgo.getTime() + 100), type: 'prompt_upload_invoice', payload: {} },
            { id: generateId('msg'), role: 'user', message: "Uploaded Invoice: invoice_002.pdf, PO: po_002.pdf", timestamp: tenMinutesAgo, type: 'file_upload', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: "Documents processed! Here are the results.", timestamp: fiveMinutesAgo, type: 'validation_result', payload: mockInvoiceResult2 },
            { id: generateId('msg'), role: 'user', message: "Why was it rejected?", timestamp: now, type: 'text_message', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: "The invoice was rejected because of missing required fields (remarks, HSN/SAC code) and a mismatch in total value of supply with the PO.", timestamp: new Date(now.getTime() + 100), type: 'text_message', payload: {} },
        ]
    },
    {
        id: generateId('session'),
        title: "Invoice #INV-2023-003 (No PO)",
        created_at: twentyMinutesAgo,
        updated_at: new Date(twentyMinutesAgo.getTime() + 5 * 60 * 1000),
        invoice_result_id: generateId('result'),
        messages: [
            { id: generateId('msg'), role: 'assistant', message: "Hi there! Welcome to your Invoice Validator. I'm here to help you process and validate invoices.", timestamp: twentyMinutesAgo, type: 'initial_welcome', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: 'Please upload your invoice document and Purchase Order (PO) to get started. You can attach them using the paperclip icon below, or choose to proceed without a PO.', timestamp: new Date(twentyMinutesAgo.getTime() + 100), type: 'prompt_upload_invoice', payload: {} },
            { id: generateId('msg'), role: 'user', message: "Uploaded Invoice: invoice_003.pdf (No PO provided)", timestamp: new Date(twentyMinutesAgo.getTime() + 2 * 60 * 1000), type: 'file_upload', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: "Documents processed! Here are the results.", timestamp: new Date(twentyMinutesAgo.getTime() + 3 * 60 * 1000), type: 'validation_result', payload: mockInvoiceResult3NoPo },
        ]
    }
];

// --- Mock API Functions ---

export const fetchMockSessions = async () => {
    console.log("Mock API: fetchMockSessions called.");
    return new Promise(resolve => setTimeout(() => {
        // Return a deep copy to prevent direct modification of the original mock data
        resolve(JSON.parse(JSON.stringify(mockSessions)));
    }, 500)); // Simulate network delay
};

export const createMockSession = async (title = "New Chat") => {
    console.log("Mock API: createMockSession called.");
    const newSessionId = generateId('session');
    const currentTime = new Date();
    const newSession = {
        id: newSessionId,
        title: title,
        created_at: currentTime,
        updated_at: currentTime,
        invoice_result_id: null,
        messages: [
            { id: generateId('msg'), role: 'assistant', message: "Hi there! Welcome to your Invoice Validator (Mock Mode).", timestamp: new Date(currentTime.getTime() + 50), type: 'initial_welcome', payload: {} },
            { id: generateId('msg'), role: 'assistant', message: 'Please upload your invoice document and Purchase Order (PO) to get started (Mock Mode).', timestamp: new Date(currentTime.getTime() + 100), type: 'prompt_upload_invoice', payload: {} },
        ]
    };
    mockSessions.unshift(newSession); // Add to the beginning of the list
    return new Promise(resolve => setTimeout(() => resolve(JSON.parse(JSON.stringify(newSession))), 300));
};

export const addMockMessageToSession = async (sessionId, messageData) => {
    console.log(`Mock API: addMockMessageToSession called for session ${sessionId}.`);
    const sessionIndex = mockSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex > -1) {
        const messageToAdd = { ...messageData, id: generateId('msg'), timestamp: new Date() };
        mockSessions[sessionIndex].messages.push(messageToAdd);
        mockSessions[sessionIndex].updated_at = new Date();
        // Move session to top of list for 'recently updated' effect
        const [movedSession] = mockSessions.splice(sessionIndex, 1);
        mockSessions.unshift(movedSession);
        return new Promise(resolve => setTimeout(() => resolve({ message: "Mock message added." }), 100));
    }
    throw new Error("Mock session not found.");
};

export const uploadMockInvoice = async (sessionId, invoiceFile, poFile, hasPo) => {
    console.log(`Mock API: uploadMockInvoice called for session ${sessionId}, hasPo: ${hasPo}.`);
    
    let resultPayload = {};
    let message = "Documents processed! Here are the mock results.";
    let status = "accepted";
    
    // Simulate different results based on input or a simple counter
    // For a real mock, you might use the file name or a more complex state
    const currentSession = mockSessions.find(s => s.id === sessionId);
    if (currentSession) {
        if (currentSession.messages.length % 2 === 0) { // Simple alternating logic
            resultPayload = mockInvoiceResult1;
            status = "accepted";
        } else {
            resultPayload = mockInvoiceResult2;
            status = "rejected";
        }

        if (!hasPo) {
             resultPayload = mockInvoiceResult3NoPo;
             status = "accepted"; // No PO is typically a valid path, not a rejection
        }
    }


    const mockResultId = generateId('result');
    const sessionIndex = mockSessions.findIndex(s => s.id === sessionId);
    if (sessionIndex > -1) {
        mockSessions[sessionIndex].invoice_result_id = mockResultId; // Link result to session
        mockSessions[sessionIndex].updated_at = new Date();
    }

    return new Promise(resolve => setTimeout(() => resolve({
        message: message,
        invoice_result_id: mockResultId,
        result_summary: JSON.parse(JSON.stringify(resultPayload)), // Deep copy
        status: status
    }), 1500)); // Simulate processing time
};

export const sendMockChatQuery = async (message, sessionId, invoiceResultId) => {
    console.log(`Mock API: sendMockChatQuery called for session ${sessionId}. Query: "${message}"`);
    
    let mockResponse = "I'm running in mock mode. I received your query. Try asking about 'total' or 'supplier'.";

    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes("total")) {
        mockResponse = "The mock invoice total is 1000.00. (Mock response)";
    } else if (lowerMessage.includes("supplier") || lowerMessage.includes("vendor")) {
        mockResponse = "The mock supplier is Lorem Ipsum. (Mock response)";
    } else if (lowerMessage.includes("date")) {
        mockResponse = "The mock invoice date is 2023-10-26. (Mock response)";
    } else if (lowerMessage.includes("reject") || lowerMessage.includes("reason")) {
        mockResponse = "The invoice might be rejected due to missing remarks or a PO mismatch in mock scenario 2. (Mock response)";
    } else if (lowerMessage.includes("how are you")) {
        mockResponse = "I'm a mock API, functioning perfectly! How can I help you with mock invoices?";
    }

    return new Promise(resolve => setTimeout(() => resolve({
        response: mockResponse,
        session_id: sessionId,
        invoice_result_id: invoiceResultId
    }), 700)); // Simulate AI response time
};
