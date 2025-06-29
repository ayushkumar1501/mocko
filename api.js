// chtwindow.jsx
import { uploadInvoice, sendChatQuery, addMessageToSession, uploadFiles } from '../api'; 
import format from 'date-fns/format'; // For formatting dates in folder paths


await uploadFiles(folderPath, invoiceFile, poFile); // instead of  uploadToLocalFolder 



// frontend/src/api.js (Add Fetch Invoice Details)

const API_BASE_URL = 'http://127.0.0.1:8000'; // Make sure this matches your FastAPI backend URL

/**
 * Uploads invoice and optional PO file to the backend storage (local or S3 based on backend configuration)
 * @param {string} folderPath - The folder path to save files (format: DD-MM-YYYY/sessionId).
 * @param {File} invoiceFile - The invoice file.
 * @param {File} [poFile=null] - The optional PO file.
 * @returns {Promise<Object>} Response from backend including storage type and file locations.
 */
export const uploadFiles = async (folderPath, invoiceFile, poFile = null) => {
  try {
    const formData = new FormData();
    formData.append('invoice', invoiceFile);
    if (poFile) formData.append('po', poFile);
    formData.append('folderPath', folderPath); // Backend will use this to create path

    const response = await fetch(`${API_BASE_URL}/upload-local/`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to upload files.');
    }

    const result = await response.json();
    console.log(`Files uploaded to ${result.storage_type || 'local'} storage`);
    return result;
  } catch (error) {
    console.error('Error uploading files:', error);
    throw error;
  }
};

// Keep the old function name for backward compatibility
export const uploadToLocalFolder = uploadFiles;


