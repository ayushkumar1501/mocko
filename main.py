# tasks.py
@task
async def extract_data_from_document_task(file_bytes: bytes, document_type: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info(f"Task: Extracting data for {document_type}...")
    extracted_data = await extract_data_with_llm(file_bytes, document_type, session_id=session_id)
    return extracted_data


#invoice_processing_flow.py

# backend/app/flows/invoice_processing_flow.py
from prefect import flow, get_run_logger
from prefect.exceptions import MissingResult
from typing import Dict, Any, Optional
from bson import ObjectId # Import ObjectId for checking duplicate invoices

# Import the tasks
from app.flows.tasks import (
    extract_data_from_document_task,
    extract_validation_criteria_task,
    validate_invoice_against_checklist_task,
    validate_invoice_against_po_task,
    generate_summary_task,
    store_invoice_result_task,
    check_duplicate_task
)

@flow(name="Invoice Processing and Validation Flow")
async def invoice_processing_flow(
    invoice_file_bytes: Optional[bytes] = None, # Make invoice_file_bytes optional
    po_file_bytes: Optional[bytes] = None,
    has_po: bool = False,
    db_conn: Any = None,
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    logger = get_run_logger()
    logger.info("Starting Invoice Processing Flow...")

    invoice_data: Dict[str, Any] = {}
    po_data: Dict[str, Any] = {}
    invoice_validation_issues: Dict[str, Any] = {}
    
    po_comparison_results: Dict[str, Any] = {"overall_match": True, "message": "PO comparison skipped, no PO provided."}

    final_summary_data: Dict[str, Any] = {
        "summary_message": "Processing did not complete fully.",
        "extracted_invoice_fields": {},
        "invoice_validation_issues": {},
        "po_comparison_results": {},
        "overall_invoice_validation_status": "Unknown",
        "overall_po_comparison_status": "Unknown",
        "selected_checklist_option": "Unknown",
        "vendor_check_result": {"is_listed_vendor": False, "message": "Vendor check not performed."}
    }

    overall_status = "failed"
    message = "An unexpected error occurred."
    invoice_result_id: Optional[str] = None

    if db_conn is None:
        logger.error("Database connection was not provided to the Prefect flow. Cannot proceed with DB operations.")
        return {
            "status": "failed",
            "message": "Database connection error.",
            "invoice_result_id": None,
            "result_summary": {"final_summary_message": "Database connection was not established for processing."}
        }

    try:
        # --- Conditional Invoice Data Extraction ---
        if invoice_file_bytes:
            logger.info("Invoice file bytes provided. Attempting invoice data extraction.")
            invoice_data = await extract_data_from_document_task(
                file_bytes=invoice_file_bytes,
                document_type="invoice",
                session_id=session_id
            )
            if not invoice_data:
                message = "Invoice data extraction failed or returned empty."
                overall_status = "failed"
                logger.error(message)
                final_summary_data["summary_message"] = message
                # Return immediately if invoice data is essential and extraction failed
                return {
                    "status": overall_status,
                    "message": message,
                    "invoice_result_id": None,
                    "result_summary": final_summary_data
                }
        else:
            logger.info("No invoice file bytes provided. Skipping invoice data extraction.")
            message = "No invoice file provided for processing."
            overall_status = "skipped_invoice"
            final_summary_data["summary_message"] = message
            # If no invoice, we cannot proceed with invoice-centric validations.
            # You might want to adjust the return logic here based on whether a PO-only flow is desired.
            # For now, if no invoice, we return a 'skipped' status.
            return {
                "status": overall_status,
                "message": message,
                "invoice_result_id": None, # No invoice_result_id if no invoice was processed
                "result_summary": final_summary_data
            }


        is_duplicate, existing_invoice_id = await check_duplicate_task(
            db_connection=db_conn,
            invoice_data=invoice_data
        )

        if is_duplicate:
            existing_invoice_doc = await db_conn.invoice_results.find_one({"_id": ObjectId(existing_invoice_id)})
            existing_summary = existing_invoice_doc.get("summary", {"summary_message": "Duplicate invoice found."}) if existing_invoice_doc else {"summary_message": "Duplicate invoice found, but original summary unavailable."}

            message = f"Duplicate invoice detected. Already processed under ID: {existing_invoice_id}"
            overall_status = "duplicate"
            logger.info(message)
            return {
                "status": overall_status,
                "message": message,
                "invoice_result_id": existing_invoice_id,
                "result_summary": existing_summary
            }

        validation_criteria = extract_validation_criteria_task(
            invoice_data=invoice_data
        )
        selected_checklist_option = validation_criteria.get("selected_option", "unknown")

        is_invoice_valid, invoice_validation_issues, vendor_check_result = await validate_invoice_against_checklist_task(
            invoice_data=invoice_data,
            validation_criteria=validation_criteria
        )

        # --- Conditional PO Data Extraction and Comparison ---
        if has_po and po_file_bytes:
            logger.info("PO file provided. Proceeding with PO extraction and comparison.")
            po_data = await extract_data_from_document_task(
                file_bytes=po_file_bytes,
                document_type="po",
                session_id=session_id
            )

            if not po_data:
                message += " PO data extraction failed. Skipping PO comparison."
                logger.warning("PO data extraction failed. Skipping PO comparison.")
                po_comparison_results = {"overall_match": False, "message": "PO data extraction failed."}
            else:
                po_comparison_results = await validate_invoice_against_po_task(
                    invoice_data=invoice_data,
                    po_data=po_data
                )
        elif has_po and po_file_bytes is None:
             logger.warning("PO was indicated but no valid PO file bytes were received. Skipping PO comparison.")
             po_comparison_results = {"overall_match": False, "message": "PO was indicated but no valid file was received."}
        else:
            logger.info("No PO file provided or explicitly skipped. Skipping PO comparison.")
            po_comparison_results = {"overall_match": True, "message": "PO comparison skipped, no PO provided."}


        final_summary_data = generate_summary_task(
            invoice_data=invoice_data,
            validation_issues=invoice_validation_issues,
            po_comparison_results=po_comparison_results,
            selected_option=selected_checklist_option,
            vendor_check_result=vendor_check_result,
            po_provided=has_po
        )

        if overall_status == "duplicate":
            pass
        elif not invoice_validation_issues and (po_comparison_results.get("overall_match", True) or not has_po):
            overall_status = "accepted"
            message = "Invoice successfully validated and matched with PO (if provided)."
        elif invoice_validation_issues:
            overall_status = "rejected"
            message = "Invoice failed validation."
        elif has_po and not po_comparison_results.get("overall_match", False):
            overall_status = "rejected"
            message = "Invoice did not match PO."
        else:
            overall_status = "rejected"
            message = "Invoice processing completed with issues."

        result_for_storage = {
            "status": overall_status,
            "message": final_summary_data.get("summary_message", "Summary message unavailable."),
            "extracted_invoice_data": invoice_data,
            "invoice_validation_status": final_summary_data.get("overall_invoice_validation_status", "Unknown"),
            "invoice_validation_issues": invoice_validation_issues,
            "extracted_po_data": po_data, # Ensure PO data is stored even if it was problematic
            "po_comparison_status": final_summary_data.get("overall_po_comparison_status", "N/A"),
            "po_comparison_results": po_comparison_results,
            "summary": final_summary_data,
            "selected_checklist_option": selected_checklist_option
        }

        stored_result_info = await store_invoice_result_task(
            invoice_result_data=result_for_storage,
            db_connection=db_conn
        )
        invoice_result_id = stored_result_info["invoice_result_id"]

        logger.info(f"Invoice Processing Flow completed with status: {overall_status}")
        return {
            "status": overall_status,
            "message": final_summary_data.get("summary_message", message),
            "invoice_result_id": invoice_result_id,
            "result_summary": final_summary_data
        }

    except MissingResult as e:
        logger.error(f"A Prefect task failed to return a result: {e}", exc_info=True)
        message = f"Processing failed: A task did not return a result. {e}"
        final_summary_data["summary_message"] = final_summary_data.get("summary_message", message)
        return {
            "status": "failed",
            "message": message,
            "invoice_result_id": None,
            "result_summary": final_summary_data
        }
    except Exception as e:
        logger.error(f"An unhandled error occurred during flow execution: {e}", exc_info=True)
        message = f"An internal error occurred: {e}"
        final_summary_data["summary_message"] = final_summary_data.get("summary_message", message)
        return {
            "status": "failed",
            "message": message,
            "invoice_result_id": None,
            "result_summary": final_summary_data
        }




# invoice_extractor.py



async def extract_data_with_llm(file_bytes: bytes, document_type: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts structured data from a document (invoice or PO) using LLM (Gemini API).
    Prompts are harmonized to extract a consistent set of fields for comparison against the checklist.

    If the MOCK_LLM_DATA_DIR environment variable is set, it will look for
    a corresponding mock data file (e.g., 'invoice.json' or 'po.json')
    in that directory instead of calling the LLM.

    Args:
        file_bytes (bytes): The bytes content of the document (image/PDF).
        document_type (str): "invoice" or "po" to tailor the prompt.
        session_id (Optional[str]): An optional session ID for mock data path construction.

    Returns:
        Dict[str, Any]: A dictionary containing the extracted fields,
                       or {"error": "...", "extracted_data": {}} on failure.
    """
    # --- START MOCK DATA LOGIC ---
    
    mock_data_dir = os.getenv("MOCK_LLM_DATA_DIR")
    
    if mock_data_dir:
        today_str = date.today().strftime("%d-%m-%Y")
        # Build base path with date folder
        full_path = os.path.join(mock_data_dir, today_str)
        # NEW: Append session ID folder when provided
        if session_id:
            full_path = os.path.join(full_path, str(session_id))

        mock_file_name = f"{document_type}.json"
        mock_file_path = os.path.join(full_path, mock_file_name)
        logger.debug(f"Session ID used for mock path: {session_id if session_id else 'N/A (backwards compatible fallback)'}")




# main.py
 flow_run_result_dict = await invoice_processing_flow(
            invoice_file_bytes=invoice_bytes,
            po_file_bytes=po_bytes, # Will be None if no PO or empty PO
            has_po=has_po, # Pass the has_po flag to the flow
            db_conn=db_conn, # Pass the database connection to the Prefect flow
            session_id=session_id
        )
        
