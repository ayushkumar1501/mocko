# backend/app/services/invoice_extractor.py
import json
import base64
from typing import Dict, Any, List
import logging
import httpx
import os
import asyncio

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

async def extract_data_with_llm(file_bytes: bytes, document_type: str) -> Dict[str, Any]:
    """
    Extracts structured data from a document (invoice or PO) using LLM (Gemini API).
    Prompts are harmonized to extract a consistent set of fields for comparison against the checklist.

    If the MOCK_LLM_DATA_DIR environment variable is set, it will look for
    a corresponding mock data file (e.g., 'invoice.json' or 'po.json')
    in that directory instead of calling the LLM.

    Args:
        file_bytes (bytes): The bytes content of the document (image/PDF).
        document_type (str): "invoice" or "po" to tailor the prompt.

    Returns:
        Dict[str, Any]: A dictionary containing the extracted fields,
                       or {"error": "...", "extracted_data": {}} on failure.
    """
    # --- START MOCK DATA LOGIC ---
    mock_data_dir = os.getenv("MOCK_LLM_DATA_DIR")
    if mock_data_dir:
        mock_file_name = f"{document_type}.json"
        mock_file_path = os.path.join(mock_data_dir, mock_file_name)
        logger.info(f"MOCK_LLM_DATA_DIR is set. Attempting to load mock data from: {mock_file_path}")
        try:
            with open(mock_file_path, 'r', encoding='utf-8') as f:
                mock_data = json.load(f)
            logger.info(f"Successfully loaded mock data for {document_type} from {mock_file_path}.")
            return mock_data
        except FileNotFoundError:
            error_msg = f"Mock data file not found for document type '{document_type}' at {mock_file_path}"
            logger.error(error_msg)
            # If mock file is missing, we could choose to fall back to LLM or return an error.
            # For demonstration, we'll return an error to indicate missing mock data.
            return {"error": error_msg, "extracted_data": {}}
        except json.JSONDecodeError as e:
            error_msg = f"Error decoding JSON from mock data file {mock_file_path}: {e}"
            logger.error(error_msg)
            return {"error": error_msg, "extracted_data": {}}
        except Exception as e:
            error_msg = f"An unexpected error occurred while loading mock data from {mock_file_path}: {e}"
            logger.error(error_msg)
            return {"error": error_msg, "extracted_data": {}}
    # --- END MOCK DATA LOGIC ---

    logger.info(f"Invoking LLM for data extraction from {document_type}...")

    base66_image_data = base64.b64encode(file_bytes).decode('utf-8')

    # Common fields and their properties for both Invoice and PO for harmonization
    common_properties = {
        "supplier_details": {
            "type": "OBJECT",
            "properties": {
                "name": {"type": "STRING"},
                "address": {"type": "STRING"},
                "gstin": {"type": "STRING"}
            },
            "propertyOrdering": ["name", "address", "gstin"]
        },
        "recipient_details": {
            "type": "OBJECT",
            "properties": {
                "name": {"type": "STRING"},
                "address": {"type": "STRING"},
                "gstin": {"type": "STRING"}
            },
            "propertyOrdering": ["name", "address", "gstin"]
        },
        "delivery_address": {"type": "STRING"},
        "hsn_sac_code": {"type": "STRING"},
        "quantity_code": {"type": "STRING"},
        "total_value_of_supply": {"type": "NUMBER"},
        "taxable_value_of_supply": {"type": "NUMBER"},
        "tax_rate": {"type": "STRING"},
        "amount_of_tax_charged": {"type": "NUMBER"},
        "place_of_supply": {"type": "STRING"},
        "delivery_address_different": {"type": "STRING"},
        "tax_payable_on_reverse_charge": {"type": "STRING"},
        "manual_digital_signature": {"type": "STRING"},
        "remarks": {"type": "STRING"},
        "bond_lut_number": {"type": "STRING"},
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "description": {"type": "STRING"},
                    "quantity": {"type": "NUMBER"},
                    "unit_price": {"type": "NUMBER"},
                    "total_line_amount": {"type": "NUMBER"},
                    "item_tax_rate": {"type": "STRING"},
                    "item_amount_of_tax_charged": {"type": "NUMBER"}
                },
                "propertyOrdering": ["description", "quantity", "unit_price", "total_line_amount", "item_tax_rate", "item_amount_of_tax_charged"]
            }
        }
    }

    if document_type == "invoice":
        system_prompt = f"""
        You are an *extremely precise* OCR and data extraction expert, specializing in invoices.
        Your single response MUST be a complete, well-formed, and valid JSON object that strictly adheres to the provided schema.
        For each field, you MUST extract the *exact and specific* value from the invoice image/document.

        **CRITICAL INSTRUCTIONS FOR ACCURATE EXTRACTION AND FORMATTING:**

        1.  **STRICT JSON STRUCTURE AND COMPLETENESS:** The output MUST be a JSON object that strictly matches the provided `responseSchema`. All keys in the schema MUST be present in your JSON output, and **all objects, arrays, and strings MUST be properly opened and closed.**
        2.  **JSON ESCAPING:** All string values MUST be properly escaped for JSON. This includes escaping double quotes ("), backslashes (\), and **newlines (\\n)** within the string. For example, if the text is "Line 1\nLine 2", output "Line 1\\nLine 2".
        3.  **GRANULARITY IS KEY:** Break down information into the smallest, most relevant sub-fields.
            -   For `name` fields: Extract ONLY the full name of the entity. Do NOT include addresses, phone numbers, emails, GSTINs, or any other extraneous text.
            -   For `address` fields: Extract ONLY the complete address string. Do NOT include names, phone numbers, emails, GSTINs, or any other extraneous text.
            -   For `gstin` fields: Extract ONLY the GSTIN string.
        4.  **HANDLING MISSING DATA:**
            -   For text fields (e.g., `invoice_number`, `remarks`): If a field is not found or is genuinely absent from the document, its value MUST be an **empty string ""**.
            -   For numeric fields (e.g., `total_value_of_supply`, `amount_of_tax_charged`): If not found or cannot be parsed as a number, its value MUST be **0.0**.
            -   For nested objects (e.g., `supplier_details`, `recipient_details`): If the main field or any of its sub-fields are not found, provide an **empty object {{}}** for the main field, and **empty strings ""** or **0.0** for its sub-fields as appropriate.
            -   For lists (e.g., `items`): If empty or not found, its value MUST be an **empty list []**.
        5.  **DATE FORMAT:** Dates MUST be strictly in `YYYY-MM-DD` format (e.g., '2018-02-21'). If the date is "DD.MM.YYYY", convert it to "YYYY-MM-DD".
        6.  **TAX RATE (Overall & Per Item):** Overall `tax_rate` as a string including percentage (e.g., "12%", "5%"). For individual `item_tax_rate`, extract as a string including percentage from the relevant tax columns (e.g., IGST, CGST, SGST, CESS - sum their percentages if needed for a single line item).
        7.  **TAX AMOUNT (Overall & Per Item):** For `amount_of_tax_charged` (overall) and `item_amount_of_tax_charged` (per item), sum all applicable taxes (e.g., IGST + CESS amount for a line item).
        8.  **BOOLEAN/PRESENCE FIELDS:** `tax_payable_on_reverse_charge` should be "Yes" or "No". `manual_digital_signature` should be "Present" or "Absent".
        9.  **PRE-PROCESSING VALUES:** Remove ALL currency symbols (€, $, ₹) and ALL commas (,) before converting numeric fields to float. When extracting quantity, convert to number and ignore text like "Discount X%".

        **FIELDS TO EXTRACT AND THEIR SPECIFIC GUIDELINES (Invoice):**

        * `invoice_number`: The primary invoice number from the document (e.g., "INVOICE X33").
        * `invoice_date`: The date the invoice was issued (e.g., "February 21, 2018" -> "2018-02-21").
        * `po_number_extracted`: The Purchase Order number specifically referenced on the invoice (e.g., "P.O. NUMBER 02" -> "02"). If no PO number is present, use "".
        * `bond_lut_number`: The BOND/LUT number referenced on the invoice. If not found, use "".
        * `supplier_details`: Details found under "ISSUED TO:", "Supplier:", "Seller:", or similar.
            * `name`: Full name of the supplier ONLY.
            * `address`: Full address of the supplier ONLY.
            * `gstin`: Supplier's GSTIN.
        * `recipient_details`: Details found under "Bill to:", "Buyer:", or "Recipient:".
            * `name`: The name of the recipient entity ONLY.
            * `address`: The address of the recipient ONLY.
            * `gstin`: Recipient's GSTIN.
        * `delivery_address`: Delivery/shipping address if explicitly mentioned as different from recipient's address. If not present, use "".
        * `hsn_sac_code`: The HSN/SAC code for the entire invoice. Look for a common HSN/SAC code if only one is present, or the first one if multiple are listed without clear association to line items in a summary. If not found, use "".
        * `quantity_code`: The overall quantity code (e.g., "1" for a single overall quantity unit). If not found, use "".
        * `total_value_of_supply`: The "TOTAL BEFORE TAX" or "SUBTOTAL" amount.
        * `taxable_value_of_supply`: The base amount on which tax is calculated. Use "TOTAL BEFORE TAX" or "SUBTOTAL".
        * `tax_rate`: The overall/dominant tax percentage for the invoice (e.g., "12%").
        * `amount_of_tax_charged`: The total calculated tax amount for the invoice (sum of all taxes like IGST, CESS).
        * `place_of_supply`: State name and State code (e.g., "Mumbai, Maharashtra (MH-27)").
        * `delivery_address_different`: "Yes" if a separate delivery address exists, otherwise "No".
        * `tax_payable_on_reverse_charge`: "Yes" or "No" based on invoice text.
        * `manual_digital_signature`: "Present" if a signature image is visible, "Absent" otherwise.
        * `remarks`: Any notes or remarks section.
        * `items`: A list of all individual line items from the invoice table. Each item MUST include:
            * `description`: The full description (e.g., "white cleaner industrial substance ISD 00456").
            * `quantity`: The quantity for this item (e.g., "23.00").
            * `unit_price`: The price per unit for this item (e.g., "200.00").
            * `total_line_amount`: The total amount for this specific line item (e.g., "4,894.40").
            * `item_tax_rate`: The *sum* of tax percentages for this item (e.g., IGST 12.00% + CESS 5% -> "17%"). If only one, just that percentage.
            * `item_amount_of_tax_charged`: The *sum* of tax amounts for this item (e.g., IGST 218.50 + CESS 218.50 -> 437.00). If only one, just that amount.
        """
        response_schema_properties = {
            "invoice_number": {"type": "STRING"},
            "invoice_date": {"type": "STRING"},
            "po_number_extracted": {"type": "STRING"},
            "bond_lut_number": {"type": "STRING"},
            "hsn_sac_code": {"type": "STRING"},
            "quantity_code": {"type": "STRING"},
            **common_properties
        }
        response_schema_properties_ordered = {
            "type": "OBJECT",
            "properties": response_schema_properties,
            "propertyOrdering": [
                "invoice_number", "invoice_date", "po_number_extracted", "bond_lut_number",
                "supplier_details", "recipient_details", "delivery_address", "hsn_sac_code", "quantity_code",
                "total_value_of_supply", "taxable_value_of_supply", "tax_rate", "amount_of_tax_charged",
                "place_of_supply", "delivery_address_different", "tax_payable_on_reverse_charge",
                "manual_digital_signature", "remarks", "items"
            ]
        }


    elif document_type == "po":
        system_prompt = f"""
        You are an *extremely precise* OCR and data extraction expert for Purchase Orders.
        Your single response MUST be a complete, well-formed, and valid JSON object that strictly adheres to the provided schema.
        For each field, you MUST extract the *exact and specific* value from the PO image/document.

        **CRITICAL INSTRUCTIONS FOR ACCURATE EXTRACTION AND FORMATTING:**

        1.  **STRICT JSON STRUCTURE AND COMPLETENESS:** The output MUST be a JSON object that strictly matches the provided `responseSchema`. All keys in the schema MUST be present in your JSON output, and **all objects, arrays, and strings MUST be properly opened and closed.** This is paramount for nested structures like 'supplier_details' and 'recipient_details'.
        2.  **JSON ESCAPING:** All string values MUST be properly escaped for JSON. This includes escaping double quotes ("), backslashes (\), and **newlines (\\n)** within the string. For example, if "Line 1\nLine 2" is found in an address, output "Line 1\\nLine 2".
        3.  **GRANULARITY IS KEY:** Break down information into the smallest, most relevant sub-fields.
            -   For `name` fields: Extract ONLY the full name of the entity. Do NOT include addresses, phone numbers, emails, GSTINs, or any other extraneous text.
            -   For `address` fields: Extract ONLY the complete address string. Do NOT include names, phone numbers, emails, GSTINs, or any other extraneous text.
            -   For `gstin` fields: Extract ONLY the GSTIN string.
        4.  **HANDLING MISSING DATA:**
            -   For text fields: If not found, use an **empty string ""**.
            -   For numeric fields: If not found or unparseable, use **0.0**.
            -   For nested objects: If the main object or any of its sub-fields are not found, provide an **empty object {{}}** for the main field, and **empty strings ""** or **0.0** for its sub-fields as appropriate.
            -   For lists (`items`): If empty or not found, its value MUST be an **empty list []**.
        5.  **DATE FORMAT:** Dates MUST be strictly in `YYYY-MM-DD` format.
        6.  **GSTIN EXTRACTION:** Extract GSTIN as a single string, stripping any prefixes like "GSTIN: ", "GST No:", etc.
        7.  **TAX RATE (Overall & Per Item):** Overall `tax_rate` as a string including percentage (e.g., "12%", "5%"). For individual `item_tax_rate`, extract as a string including percentage from relevant tax columns.
        8.  **TAX AMOUNT (Overall & Per Item):** For `amount_of_tax_charged` (overall) and `item_amount_of_tax_charged` (per item), sum all applicable taxes.
        9.  **BOOLEAN/PRESENCE FIELDS:** `tax_payable_on_reverse_charge` should be "Yes" or "No". `manual_digital_signature` should be "Present" or "Absent".
        10. **PRE-PROCESSING VALUES:** Remove ALL currency symbols (€, $, ₹) and ALL commas (,) from numeric values before converting to float. When extracting quantity, convert to number and ignore text like "Discount X%".

        **FIELDS TO_EXTRACT AND THEIR SPECIFIC GUIDELINES (Purchase Order):**

        * `po_number`: The primary Purchase Order number (e.g., "P.O. NUMBER 02").
        * `po_date`: The date the PO was issued (e.g., "P.O. Date January 24, 2018" -> "2018-01-24").
        * `invoice_number`: Any Invoice Number referenced on the PO (if any). If not found, use "".
        * `invoice_date`: Any Invoice Date referenced on the PO (if any). If not found, use "".
        * `bond_lut_number`: The BOND/LUT number referenced on the PO. If not found, use "".
        * `supplier_details`: Details found under "Supplier:", "Vendor:", "Ship From:".
            * `name`: Full name of the supplier ONLY.
            * `address`: Full address of the supplier ONLY.
            * `gstin`: Supplier's GSTIN.
        * `recipient_details`: Details found under "Bill To:", "Buyer:", or "Ordered By:".
            * `name`: The name of the recipient entity ONLY.
            * `address`: The address of the recipient ONLY.
            * `gstin`: Recipient's GSTIN.
        * `delivery_address`: Shipping address if specified. If not present, use "".
        * `hsn_sac_code`: The HSN/SAC code for the entire PO. Look for a common HSN/SAC code if only one is present, or the first one if multiple are listed without clear association to line items in a summary. If not found, use "".
        * `quantity_code`: The overall quantity code for the PO. If not found, use "".
        * `total_value_of_supply`: The subtotal amount before taxes.
        * `taxable_value_of_supply`: The base amount on which tax is calculated.
        * `tax_rate`: The overall/dominant tax percentage for the PO (e.g., "12%").
        * `amount_of_tax_charged`: The total calculated tax amount for the PO.
        * `place_of_supply`: State name and State code.
        * `delivery_address_different`: "Yes" if a separate delivery address exists, otherwise "No".
        * `tax_payable_on_reverse_charge`: "Yes" or "No" (if PO specifies this).
        * `manual_digital_signature`: "Present" or "Absent" (if PO includes signature).
        * `remarks`: Any notes or remarks section.
        * `items`: A list of all individual line items from the PO table. Each item MUST include:
            * `description`: The full description of the product or service.
            * `quantity`: The quantity for this item.
            * `unit_price`: The price per unit for this item.
            * `total_line_amount`: The total amount for this specific line item (quantity * unit price).
            * `item_tax_rate`: The specific tax percentage for this item (e.g., "18%").
            * `item_amount_of_tax_charged`: The specific tax amount for this item.
        * `total_amount`: The grand total amount of the PO (numeric, including taxes).
        """
        response_schema_properties = {
            "po_number": {"type": "STRING"},
            "po_date": {"type": "STRING"},
            "invoice_number": {"type": "STRING"},
            "invoice_date": {"type": "STRING"},
            "hsn_sac_code": {"type": "STRING"},
            "quantity_code": {"type": "STRING"},
            "total_amount": {"type": "NUMBER"},
            **common_properties
        }
        response_schema_properties_ordered = {
            "type": "OBJECT",
            "properties": response_schema_properties,
            "propertyOrdering": [
                "po_number", "po_date", "invoice_number", "invoice_date", "bond_lut_number",
                "supplier_details", "recipient_details", "delivery_address", "hsn_sac_code", "quantity_code",
                "total_value_of_supply", "taxable_value_of_supply", "tax_rate", "amount_of_tax_charged",
                "place_of_supply", "delivery_address_different", "tax_payable_on_reverse_charge",
                "manual_digital_signature", "remarks", "items", "total_amount"
            ]
        }

    else:
        logger.error(f"Unsupported document type: {document_type}")
        raise ValueError(f"Unsupported document type: {document_type}")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY environment variable not set. Please set it in your .env file.")
        return {"error": "GEMINI_API_KEY not set", "extracted_data": {}}

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"

    max_retries = 3
    retry_delay_seconds = 0.5
    last_error_message = ""

    for attempt in range(max_retries):
        try:
            chat_history = [
                { "role": "user", "parts": [
                    { "text": system_prompt },
                    { "inlineData": { "mimeType": "image/png", "data": base66_image_data } }
                ]}
            ]
            payload = {
                "contents": chat_history,
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": response_schema_properties_ordered,
                    "maxOutputTokens": 32768
                }
            }

            async with httpx.AsyncClient(timeout=120.0) as client_http:
                response = await client_http.post(
                    api_url,
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                )
                response.raise_for_status()
                result = response.json()

            if result.get("candidates") and result["candidates"][0].get("content") and result["candidates"][0]["content"].get("parts"):
                extracted_json_str = result["candidates"][0]["content"]["parts"][0].get("text")
                if extracted_json_str:
                    try:
                        if extracted_json_str.strip().startswith("```json") and extracted_json_str.strip().endswith("```"):
                            extracted_json_str = extracted_json_str.strip()[len("```json"): -len("```")].strip()
                        elif extracted_json_str.strip().startswith("```") and extracted_json_str.strip().endswith("```"):
                            extracted_json_str = extracted_json_str.strip()[len("```"): -len("```")].strip()
                        
                        extracted_data = json.loads(extracted_json_str)
                        logger.info(f"LLM extracted data for {document_type} (Attempt {attempt + 1}): {extracted_data}")
                        return extracted_data
                    except json.JSONDecodeError as e:
                        last_error_message = f"JSON decode error after LLM extraction for {document_type} (Attempt {attempt + 1}): {e}. Raw response (first 2000 chars): '{extracted_json_str[:2000]}...'"
                        logger.error(last_error_message)
                        if attempt == max_retries - 1:
                            break
                        await asyncio.sleep(retry_delay_seconds)
                else:
                    last_error_message = f"LLM extraction failed for {document_type} (Attempt {attempt + 1}): Extracted text part is empty."
                    logger.warning(last_error_message)
                    if attempt == max_retries - 1:
                        break
                    await asyncio.sleep(retry_delay_seconds)
            else:
                last_error_message = f"LLM extraction failed for {document_type} (Attempt {attempt + 1}): No candidates or content found in response."
                logger.warning(last_error_message)
                if attempt == max_retries - 1:
                    break
                await asyncio.sleep(retry_delay_seconds)

        except httpx.HTTPStatusError as e:
            last_error_message = f"HTTP error during LLM extraction for {document_type} (Attempt {attempt + 1}): {e.response.status_code} - {e.response.text}"
            logger.error(last_error_message)
            if attempt == max_retries - 1:
                break
            await asyncio.sleep(retry_delay_seconds)
        except httpx.RequestError as e:
            last_error_message = f"Request error during LLM extraction for {document_type} (Attempt {attempt + 1}): {e}. Consider increasing timeout if this persists."
            logger.error(last_error_message)
            if attempt == max_retries - 1:
                break
            await asyncio.sleep(retry_delay_seconds)
        except Exception as e:
            last_error_message = f"Unexpected error during LLM extraction for {document_type} (Attempt {attempt + 1}): {e}"
            logger.error(last_error_message, exc_info=True)
            if attempt == max_retries - 1:
                break
            await asyncio.sleep(retry_delay_seconds)
    
    logger.error(f"Failed to extract data for {document_type} after {max_retries} attempts. Last error: {last_error_message}")
    return {"error": last_error_message, "extracted_data": {}}
