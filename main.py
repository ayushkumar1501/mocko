from pathlib import Path
import shutil

@app.post("/upload-local/")
async def upload_local(
    folderPath: str = Form(...),
    invoice: UploadFile = File(...),
    po: UploadFile = File(None)
):
    upload_dir = Path("uploads") / folderPath
    upload_dir.mkdir(parents=True, exist_ok=True)

    invoice_path = upload_dir / invoice.filename
    with open(invoice_path, "wb") as f:
        shutil.copyfileobj(invoice.file, f)

    if po:
        po_path = upload_dir / po.filename
        with open(po_path, "wb") as f:
            shutil.copyfileobj(po.file, f)

    return {"message": "Files uploaded successfully", "path": str(upload_dir)}
