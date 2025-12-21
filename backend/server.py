from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv
from typing import Optional, List, Dict
import json
import uuid
from pathlib import Path
import boto3
from pypdf import PdfReader
import io
from anthropic import Anthropic
from guardrails import check_forbidden, check_pii


# Load environment variables
load_dotenv(override=True)

app = FastAPI()

# Configure CORS
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize clients
# client = OpenAI()
client = OpenAI(api_key=os.getenv("google_api_key"), base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
claude = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Memory directory
MEMORY_DIR = Path("../memory")
MEMORY_DIR.mkdir(exist_ok=True)

# Memory functions
def load_conversation(session_id: str) -> List[Dict]:
    file_path = MEMORY_DIR / f"{session_id}.json"
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_conversation(session_id: str, messages: List[Dict]):
    file_path = MEMORY_DIR / f"{session_id}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(messages, f, indent=2, ensure_ascii=False)

# ================= ACADEMIC CHECK =================
def looks_academic_structurally(text: str) -> bool:
    markers = [
        "abstract", "introduction", "methodology", "methods",
        "results", "discussion", "conclusion", "references",
        "bibliography", "chapter", "section", "figure", "table",
        "doi", "et al."
    ]
    text_lower = text.lower()
    score = sum(1 for m in markers if m in text_lower)
    return score >= 3

def is_academic_document_llm(pdf_text: str) -> bool:
    check = claude.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=5,
        system="Reply ONLY with YES or NO.",
        messages=[{
            "role": "user",
            "content": [{
                "type": "text",
                "text": f"""
DOCUMENT EXCERPT:
{pdf_text[:5000]}

Is this an academic or instructional document
(e.g., university lecture, research paper, thesis, textbook)?

Answer YES or NO.
"""
            }]
        }]
    )
    return check.content[0].text.strip().upper() == "YES"

def is_valid_academic_document(pdf_text: str) -> bool:
    if not looks_academic_structurally(pdf_text):
        return False
    return is_academic_document_llm(pdf_text)


# def extract_metadata(pdf_text: str) -> dict:
#     response = client.chat.completions.create(
#         # model="gpt-4o-mini",
#         model="gemini-2.0-flash",
#         messages=[
#             {
#                 "role": "system",
#                 "content": """
# You extract academic metadata from documents.

# RULES:
# - Use ONLY the provided text.
# - Do NOT guess.
# - If not found, return null.

# Return valid JSON ONLY.
# """
#             },
#             {
#                 "role": "user",
#                 "content": f"""
# DOCUMENT TEXT:
# {pdf_text[:6000]}

# Extract:
# - instructor_name
# - institution_name
# - course_title
# - department

# JSON FORMAT:
# {{
#   "instructor_name": string | null,
#   "institution_name": string | null,
#   "course_title": string | null,
#   "department": string | null
# }}
# """
#             }
#         ],
#         response_format={"type": "json_object"}
#     )

#     return json.loads(response.choices[0].message.content)

def extract_metadata(pdf_text: str) -> dict:
    response = client.chat.completions.create(
        model="gemini-2.0-flash",
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract academic metadata from the document.\n"
                    "Return ONE JSON OBJECT only (not an array).\n"
                    "If a field is missing, use null."
                )
            },
            {
                "role": "user",
                "content": f"""
DOCUMENT TEXT:
{pdf_text[:6000]}

Return JSON with EXACT keys:
- instructor_name
- institution_name
- course_title
- department
"""
            }
        ],
        response_format={"type": "json_object"}
    )

    raw = json.loads(response.choices[0].message.content)

    # 🔒 Normalize output
    if isinstance(raw, list):
        return raw[0] if raw else {}

    if isinstance(raw, dict):
        return raw

    return {}



def format_metadata(metadata: dict) -> str:
    lines = []

    if metadata.get("course_title"):
        lines.append(f"📘 Course: {metadata['course_title']}")
    if metadata.get("instructor_name"):
        lines.append(f"👨‍🏫 Instructor: {metadata['instructor_name']}")
    if metadata.get("institution_name"):
        lines.append(f"🏛 Institution: {metadata['institution_name']}")
    if metadata.get("department"):
        lines.append(f"🏫 Department: {metadata['department']}")

    if not lines:
        return "No instructor or institution information was explicitly found in the document."

    return "\n".join(lines)




# ---------- PROMPTS ----------

def optimizer_prompt(pdf_text: str, user_question: str) -> str:
    return f"""
You are a STRICT document-grounded academic assistant.

RULES (MUST FOLLOW):
1. You may ONLY answer using information in the PDF.
2. You may generate answers using information in the PDF.
3. Do NOT answer general questions.
4. Do NOT speculate.
5. If answer not found in PDF, reply EXACTLY:
"I can only answer questions based on the uploaded document."


PDF CONTENT:
------------------------------
{pdf_text}
------------------------------

USER QUESTION:
{user_question}

Answer concisely and academically.
"""

def evaluator_prompt(pdf_text: str, user_question: str, draft_answer: str) -> str:
    return f"""
You are an evaluator reviewing an AI-generated answer.

PDF CONTENT:
{pdf_text}

USER QUESTION:
{user_question}

DRAFT ANSWER:
{draft_answer}

Evaluate:
1. Accuracy vs PDF
2. Completeness
3. Clarity
4. Hallucinations
5. Relevance
6. Use of headings and subheadings
7. Use of bullet points and lists
8. Use of proper grammar and punctuation
9. Use of proper academic language
10. Use of proper academic citations
11. Off-topic answers (if any)

Return:
- A brief critique
- Clear suggestions for improvement
- Feedback on how to improve the answer
"""

def optimizer_refine_prompt(user_question: str, draft_answer: str, critique: str) -> str:
    return f"""
You are a Senior academic instructor improving an answer.

USER QUESTION:
{user_question}

ORIGINAL ANSWER:
{draft_answer}

EVALUATOR FEEDBACK:
{critique}

Produce a final improved answer. Use headings and subheadings.

OUTPUT FORMAT MUST BE:
Bullet points and lists
Proper grammar and punctuation
Proper academic language
Use markdown formatting
DO NOT MENTION THAT IT IS A IMPROVED ANSWER!

"""

# ---------- RELEVANCE CHECK ----------
def is_question_relevant(pdf_text: str, question: str) -> bool:
    check = claude.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=5,
        system="Reply ONLY with YES or NO.",
        messages=[
            {
                "role": "user",
                "content": [{
                    "type": "text",
                    "text": f"""
PDF CONTENT:
{pdf_text}

QUESTION:
{question}

Is the request grounded in the PDF content, including:
- summarization
- brainstorming
- discussion ideas
- research questions
- explanations
- analysis
- critique
- educational tasks
- any questions related to the uploaded document
AND does NOT require external knowledge?

Answer YES or NO.
"""
                }]
            }
        ]
    )
    return check.content[0].text.strip().upper() == "YES"


# ---------- POST-ANSWER VALIDATION ----------
def answer_mentions_pdf(answer: str) -> bool:
    keywords = ["document", "pdf", "section", "chapter", "according"]
    return any(k in answer.lower() for k in keywords)

# ---------- REQUEST / RESPONSE MODELS ----------
class ChatRequest(BaseModel):
    message: Optional[str] = None
    session_id: Optional[str] = None
    key: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str

# ---------- ROUTES ----------
@app.get("/")
async def root():
    return {"message": "AI Digital Lecture Assistant with Memory"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/chat2", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message:
        raise HTTPException(status_code=400, detail="Message is required")
    if not request.key:
        raise HTTPException(status_code=400, detail="S3 key is required")

    # ---------- Load PDF from S3 ----------
    s3 = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION"),
    )
    bucket = os.getenv("S3_BUCKET_NAME")

    try:
        obj = s3.get_object(Bucket=bucket, Key=request.key)
    except s3.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="PDF not found in S3")


    pdf_bytes = obj["Body"].read()
    reader = PdfReader(io.BytesIO(pdf_bytes))

    pdf_text = ""
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pdf_text += text + "\n"

    if not pdf_text.strip():
        raise HTTPException(status_code=400, detail="PDF has no readable text")

    ### ---------- GUARDRAIL: Pre-question relevance ----------
    if not is_question_relevant(pdf_text, request.message):
        return ChatResponse(
            response="I can only answer questions related to the uploaded document.",
            session_id=request.session_id or str(uuid.uuid4())
        )

    
    if not is_valid_academic_document(pdf_text):
        return ChatResponse(
            response=(
                "The uploaded document does not appear to be an academic or instructional document. "
                "Please upload a university lecture, research paper, thesis, or textbook PDF."
            ),
            session_id=request.session_id or str(uuid.uuid4())
        )
    
    metadata = extract_metadata(pdf_text)
    # formatted_metadata = format_metadata(metadata)

    # ---------- Session Handling ----------
    session_id = request.session_id or str(uuid.uuid4())
    conversation = load_conversation(session_id)

    if check_forbidden(request.message):
        return {
            "reply": "I can’t help with that request"
        }
    if check_pii(request.message):
        return {
            "reply": "I can’t help with that request"
        }


    # ---------- OPTIMIZER #1 (Draft Answer) ----------
    draft_completion = client.chat.completions.create(
        # model="gpt-4o-mini",
        model="gemini-2.0-flash",
        messages=[
            # {"role": "system", "content": optimizer_prompt(pdf_text, request.message)} # openai
            {"role": "user", "content": optimizer_prompt(pdf_text, request.message)} # gemini
        ]
    )
    draft_answer = draft_completion.choices[0].message.content

    # ---------- EVALUATOR ----------
    evaluation_completion = claude.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1000,
        system=[
            {"type": "text", "text": evaluator_prompt(pdf_text, request.message, draft_answer)}
        ],
        messages=[
            {"role": "user", "content": [{"type": "text", "text": "Please evaluate the draft answer."}]}
        ]
    )
    critique = evaluation_completion.content[0].text

    # ---------- OPTIMIZER #2 (Final Answer) ----------
    final_completion = client.chat.completions.create(
        # model="gpt-4o-mini",
        model="gemini-2.0-flash",
        messages=[
            {"role": "user", "content": optimizer_refine_prompt(request.message, draft_answer, critique)}
        ]
    )
    final_answer = final_completion.choices[0].message.content

    header = []
    if metadata["course_title"]:
        header.append(f"📘 Course: {metadata['course_title']}")
    if metadata["instructor_name"]:
        header.append(f"👨‍🏫 Instructor: {metadata['instructor_name']}")
    if metadata["institution_name"]:
        header.append(f"🏛 Institution: {metadata['institution_name']}")

    final_answer = ("\n".join(header) + "\n\n" if header else "") + final_answer

    # ---------- POST-ANSWER VALIDATION ----------
    # if not answer_mentions_pdf(final_answer):
    #     final_answer = "I can only answer questions based on the uploaded document."

    # ---------- Save Conversation ----------
    conversation.append({"role": "user", "content": request.message})
    conversation.append({"role": "assistant", "content": final_answer})
    save_conversation(session_id, conversation)

    return ChatResponse(
        response=final_answer,
        session_id=session_id
    )

@app.get("/sessions")
async def list_sessions():
    sessions = []
    for file_path in MEMORY_DIR.glob("*.json"):
        session_id = file_path.stem
        with open(file_path, "r", encoding="utf-8") as f:
            conversation = json.load(f)
            sessions.append({
                "session_id": session_id,
                "message_count": len(conversation),
                "last_message": conversation[-1]["content"] if conversation else None
            })
    return {"sessions": sessions}

# ---------- Run ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
