# backend/app/services/file_storage.py
import os
import boto3
from pathlib import Path
from typing import Optional, Tuple
from botocore.exceptions import NoCredentialsError, ClientError
from dotenv import load_dotenv
import shutil
import mimetypes

# Import storage utilities
from app.utils.storage_utils import log_storage_operation, validate_storage_environment

# Load environment variables
load_dotenv()

class FileStorageService:
    """
    Service to handle file storage with support for both local filesystem and AWS S3.
    Storage method is determined by the LOCAL environment variable.
    """
    def __init__(self):
        self.is_local = os.getenv("LOCAL", "true").lower() == "true"
        print("is_local  🚨 : ", self.is_local )
        if not self.is_local:
            # Initialize S3 client for cloud storage
            self.s3_bucket = os.getenv("AWS_S3_BUCKET_NAME")
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                region_name=os.getenv("AWS_REGION", "us-east-1")
            )
            self.s3_base_url = os.getenv("AWS_S3_BASE_URL", f"https://{self.s3_bucket}.s3.amazonaws.com")
            
            # Validate S3 configuration
            is_valid, error_msg = validate_storage_environment()
            if not is_valid:
                raise ValueError(error_msg)
    
    def _get_content_type(self, file_path: str, default: str = "application/octet-stream") -> str:
        """
        Determine content type from file extension.
        """
        content_type, _ = mimetypes.guess_type(file_path)
        return content_type or default

    async def upload_file(
        self, 
        file_content: bytes, 
        file_path: str,
        content_type: Optional[str] = None
    ) -> Tuple[bool, str, str]:
        """
        Upload a file to either local storage or S3.
        
        Args:
            file_content: The file content as bytes
            file_path: The path where the file should be stored (e.g., "dd-MM-yyyy/sessionId/filename.ext")
            content_type: Optional MIME type for the file
        Returns:
            Tuple of (success: bool, storage_type: str, path_or_url: str)
        """
        try:
            # Auto-detect content type if not provided
            if not content_type:
                content_type = self._get_content_type(file_path)
            
            if self.is_local:
                return await self._upload_local(file_content, file_path)
            else:
                return await self._upload_s3(file_content, file_path, content_type)
        except Exception as e:
            storage_type = "local" if self.is_local else "s3"
            log_storage_operation("upload", file_path, storage_type, False, str(e))
            return False, "error", str(e)
    
    async def _upload_local(self, file_content: bytes, file_path: str) -> Tuple[bool, str, str]:
        """Upload file to local filesystem."""
        try:
            # Create full path
            full_path = Path("uploads") / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write file
            with open(full_path, "wb") as f:
                f.write(file_content)
            
            log_storage_operation("upload", file_path, "local", True, f"Size: {len(file_content)} bytes")
            return True, "local", str(full_path)
        except Exception as e:
            log_storage_operation("upload", file_path, "local", False, str(e))
            raise
    
    async def _upload_s3(
        self, 
        file_content: bytes, 
        file_path: str,
        content_type: Optional[str] = None
    ) -> Tuple[bool, str, str]:
        """Upload file to AWS S3."""
        try:
            # Prepare S3 key (remove leading slash if present)
            s3_key = file_path.lstrip('/')
            
            # Prepare upload arguments
            extra_args = {}
            if content_type:
                extra_args['ContentType'] = content_type
            
            # Upload to S3
            self.s3_client.put_object(
                Bucket=self.s3_bucket,
                Key=s3_key,
                Body=file_content,
                **extra_args
            )
            
            # Generate URL
            file_url = f"{self.s3_base_url}/{s3_key}"
            
            log_storage_operation("upload", s3_key, "s3", True, f"Size: {len(file_content)} bytes, URL: {file_url}")
            return True, "s3", file_url
        except NoCredentialsError:
            error_msg = "AWS credentials not available"
            log_storage_operation("upload", file_path, "s3", False, error_msg)
            raise Exception(error_msg)
        except ClientError as e:
            error_msg = f"AWS S3 error: {e}"
            log_storage_operation("upload", file_path, "s3", False, error_msg)
            raise Exception(error_msg)
        except Exception as e:
            log_storage_operation("upload", file_path, "s3", False, str(e))
            raise
    
    def get_storage_type(self) -> str:
        """Return the current storage type being used."""
        return "local" if self.is_local else "s3"
    
    def validate_configuration(self) -> bool:
        """Validate that the storage configuration is properly set up."""
        if self.is_local:
            # For local storage, ensure uploads directory exists
            Path("uploads").mkdir(exist_ok=True)
            return True
        else:
            # For S3, test connection
            try:
                self.s3_client.head_bucket(Bucket=self.s3_bucket)
                log_storage_operation("validate", self.s3_bucket, "s3", True, "Bucket accessible")
                return True
            except Exception as e:
                log_storage_operation("validate", self.s3_bucket, "s3", False, str(e))
                return False

# Create a singleton instance
file_storage_service = FileStorageService() 






# invoice_extractor.py

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
        today_str = date.today().strftime("%d-%m-%Y")
        full_path = os.path.join(mock_data_dir, today_str)
        mock_data_dir=full_path
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






#backend/app/utils/storage_utils.py
"""
Storage utility functions for configuration validation and logging.
"""
import os
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv()

def get_storage_config() -> Dict[str, Any]:
    """
    Get the current storage configuration.
    
    Returns:
        Dict containing storage configuration details
    """
    is_local = os.getenv("LOCAL", "true").lower() == "true"
    
    config = {
        "is_local": is_local,
        "storage_type": "local" if is_local else "s3"
    }
    
    if not is_local:
        config.update({
            "s3_bucket": os.getenv("AWS_S3_BUCKET_NAME"),
            "s3_region": os.getenv("AWS_REGION", "us-east-1"),
            "s3_base_url": os.getenv("AWS_S3_BASE_URL"),
            "has_credentials": bool(os.getenv("AWS_ACCESS_KEY_ID") and os.getenv("AWS_SECRET_ACCESS_KEY"))
        })
    
    return config

def validate_storage_environment() -> tuple[bool, str]:
    """
    Validate that all required environment variables are set for the current storage mode.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    config = get_storage_config()
    
    if config["is_local"]:
        # Local storage doesn't require additional configuration
        return True, "Local storage configuration is valid"
    
    # Check S3 configuration
    required_vars = [
        "AWS_S3_BUCKET_NAME",
        "AWS_ACCESS_KEY_ID", 
        "AWS_SECRET_ACCESS_KEY"
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        return False, f"Missing required S3 environment variables: {', '.join(missing_vars)}"
    
    return True, "S3 storage configuration is valid"

def log_storage_operation(operation: str, file_path: str, storage_type: str, success: bool, details: str = ""):
    """
    Log storage operations for debugging and monitoring.
    
    Args:
        operation: The operation performed (upload, download, delete)
        file_path: The file path involved
        storage_type: local or s3
        success: Whether the operation was successful
        details: Additional details about the operation
    """
    status = "SUCCESS" if success else "FAILED"
    message = f"[STORAGE] {operation.upper()} {status} | Type: {storage_type} | Path: {file_path}"
    
    if details:
        message += f" | Details: {details}"
    
    print(message) 






# backend/app/main.py
import os
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import json
from bson import ObjectId
import shutil
from pathlib import Path

# Import your database connection and models
from app.database.connection import connect_to_mongo, close_mongo_connection, get_db
from app.database.models import InvoiceProcessingResult, ChatSession, ChatMessage, InvoiceData, PoData, PyObjectId

# Import your Prefect flow and chat task
from app.flows.invoice_processing_flow import invoice_processing_flow
from app.flows.tasks import handle_follow_up_query_task

# Import file storage service
from app.services.file_storage import file_storage_service

# Import storage utilities
from app.utils.storage_utils import get_storage_config, validate_storage_environment

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Invoice Validation System",
    description="API for uploading invoices, validating them against a checklist, comparing with POs, and handling follow-up queries using LLMs and Prefect.",
    version="1.0.0"
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# --- FastAPI Startup/Shutdown Events for MongoDB Connection ---
@app.on_event("startup")
async def startup_db_client():
    """Connect to MongoDB on FastAPI application startup."""
    await connect_to_mongo()
    # Validate storage configuration on startup
    storage_type = file_storage_service.get_storage_type()
    print(f"Storage mode: {storage_type.upper()}")
    if not file_storage_service.validate_configuration():
        print(f"WARNING: {storage_type} storage configuration validation failed!")

@app.on_event("shutdown")
async def shutdown_db_client():
    """Close MongoDB connection on FastAPI application shutdown."""
    await close_mongo_connection()

# --- Request Body Models for API Endpoints ---
class ChatRequest(BaseModel):
    message: str
    invoice_result_id: Optional[str] = None
    session_id: str

class NewChatSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"

class MessageAddRequest(BaseModel):
    role: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    type: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None

# --- API Endpoints ---
@app.post("/upload-local/")
async def upload_local(
    folderPath: str = Form(...),
    invoice: UploadFile = File(...),
    po: UploadFile = File(None)
):
    """
    Upload files to either local storage or S3 based on the LOCAL environment variable.
    Despite the endpoint name, it now supports both storage methods.
    """
    try:
        # Read invoice file content
        invoice_content = await invoice.read()
        invoice_path = f"{folderPath}/{invoice.filename}"
        
        # Upload invoice using the storage service
        success, storage_type, invoice_location = await file_storage_service.upload_file(
            invoice_content, 
            invoice_path,
            content_type=invoice.content_type
        )
        
        if not success:
            raise HTTPException(status_code=500, detail=f"Failed to upload invoice: {invoice_location}")
        
        po_location = None
        if po:
            # Read PO file content
            po_content = await po.read()
            po_path = f"{folderPath}/{po.filename}"
            
            # Upload PO using the storage service
            po_success, _, po_location = await file_storage_service.upload_file(
                po_content,
                po_path,
                content_type=po.content_type
            )
            
            if not po_success:
                raise HTTPException(status_code=500, detail=f"Failed to upload PO: {po_location}")
        print(f"Files ❗🚨❗🚨❗🚨❗🚨 uploaded successfully: Invoice at {invoice_location}, PO at {po_location if po else 'N/A'}")
        # Reset file pointers for any potential reuse
        await invoice.seek(0)
        if po:
            await po.seek(0)
        
        return {
            "message": f"Files uploaded successfully to {storage_type} storage",
            "storage_type": storage_type,
            "path": folderPath,
            "invoice_location": invoice_location,
            "po_location": po_location
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in upload endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

