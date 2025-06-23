// Now in your handleModalUploadAndClose(...), you just do:

const dateFolder = format(new Date(), 'dd-MM-yyyy');
const folderPath = `${dateFolder}/${currentChatSession.id}/`;

// First: Save files locally
await uploadToLocalFolder(folderPath, invoiceFile, poFile);

// Optional delay
await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000));

// Then: Trigger invoice processing pipeline
const result = await uploadInvoice(currentChatSession.id, invoiceFile, poFile, hasPo);


//  api.js
/**
 * Uploads invoice and optional PO file to a specific folder on the backend (e.g., /uploads/DATE/SESSION_ID/)
 * @param {string} folderPath - The folder path to save files (format: DD-MM-YYYY/sessionId).
 * @param {File} invoiceFile - The invoice file.
 * @param {File} [poFile=null] - The optional PO file.
 * @returns {Promise<Object>} Confirmation from backend.
 */
export const uploadToLocalFolder = async (folderPath, invoiceFile, poFile = null) => {
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
      throw new Error(errorData.detail || 'Failed to upload files to local folder.');
    }

    return await response.json();
  } catch (error) {
    console.error('Error uploading to local folder:', error);
    throw error;
  }
};
