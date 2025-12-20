from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv
from typing import Optional, List, Dict
import json
import uuid
from datetime import datetime
from pathlib import Path
import boto3
from pypdf import PdfReader
import io
from context import prompt
from anthropic import Anthropic



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

# Initialize OpenAI client
client = OpenAI()
claude = Anthropic()

# Memory directory
MEMORY_DIR = Path("../memory")
MEMORY_DIR.mkdir(exist_ok=True)



# Load personality details
def load_personality():
    with open("me.txt", "r", encoding="utf-8") as f:
        return f.read().strip()

# Load personality details
def load_pdf():
    with open("pdf.txt", "r", encoding="utf-8") as f:
        return f.read().strip()


PERSONALITY = load_personality()


# Memory functions
def load_conversation(session_id: str) -> List[Dict]:
    """Load conversation history from file"""
    file_path = MEMORY_DIR / f"{session_id}.json"
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_conversation(session_id: str, messages: List[Dict]):
    """Save conversation history to file"""
    file_path = MEMORY_DIR / f"{session_id}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(messages, f, indent=2, ensure_ascii=False)

def optimizer_prompt(pdf_text: str, user_question: str) -> str:
    return f"""
# Your Role
You are an AI Agent that is acting as a digital teacher of University lecture for Masters and Phd students.
You are chatting with a user who is chatting with you about a University lecture and you are trying to help them. Your goal is to represent University lecture as faithfully as possible;

PDF CONTENT:
{pdf_text}

USER QUESTION:
{user_question}

Rules:
- Answer ONLY from the PDF
- If the answer is not found, say: "Not found in the document"
- Be concise and accurate
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

Evaluate the draft based on:
1. Accuracy vs PDF
2. Completeness
3. Clarity
4. Hallucinations

Return:
- A brief critique
- Clear suggestions for improvement
"""

def optimizer_refine_prompt(user_question: str, draft_answer: str, critique: str) -> str:
    return f"""
# Your Role
You are an AI Agent that is acting as a Senior teacher of University lecture for Masters and Phd students.
You are improving an answer based on evaluator feedback.

USER QUESTION:
{user_question}

ORIGINAL ANSWER:
{draft_answer}

EVALUATOR FEEDBACK:
{critique}

Produce a final improved answer. Use heading and sub heading.
"""




# Request/Response models
class ChatRequest(BaseModel):
    message: Optional[str] = None
    session_id: Optional[str] = None
    key: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
  


@app.get("/")
async def root():
    return {"message": "AI Digital Twin API with Memory"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):

    if not request.message:
        raise HTTPException(status_code=400, detail="Message is required")

    if not request.key:
        raise HTTPException(status_code=400, detail="S3 key is required")

    # key = f"uploads/{request.key}"
    key = request.key

    print("key: "+key)

    s3 = boto3.client(
        "s3",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION"),
    )

    bucket = os.getenv("S3_BUCKET_NAME")

    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
    except s3.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="PDF not found in S3")

    pdf_bytes = obj["Body"].read()
    reader = PdfReader(io.BytesIO(pdf_bytes))

    pdf_text = ""
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pdf_text += text

    print(pdf_text)
    
    # _prompt = prompt(pdf_text)

     # Build messages for OpenAI
    messages = [{"role": "system", "content": prompt(pdf_text)}]

    session_id = request.session_id or str(uuid.uuid4())
    conversation = load_conversation(session_id)

    messages = [{"role": "system", "content": pdf_text}]
    messages.extend(conversation)
    messages.append({"role": "user", "content": request.message})

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages
    )

    assistant_response = response.choices[0].message.content

    

    conversation.append({"role": "user", "content": request.message})
    conversation.append({"role": "assistant", "content": assistant_response})
    save_conversation(session_id, conversation)

    return ChatResponse(
        response=assistant_response,
        session_id=session_id
    )



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

    # ---------- Session Handling ----------
    session_id = request.session_id or str(uuid.uuid4())
    conversation = load_conversation(session_id)

    # ---------- OPTIMIZER #1 (Draft Answer) ----------
    draft_completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": optimizer_prompt(pdf_text, request.message)
            }
        ]
    )

    draft_answer = draft_completion.choices[0].message.content

    # ---------- EVALUATOR ----------
    # evaluation_completion = client.chat.completions.create(
    #     model="gpt-4o-mini",
    #     messages=[
    #         {
    #             "role": "system",
    #             "content": evaluator_prompt(
    #                 pdf_text,
    #                 request.message,
    #                 draft_answer
    #             )
    #         }
    #     ]
    # )

    # critique = evaluation_completion.choices[0].message.content

    evaluation_completion = claude.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1000,

        system=[
            {
                "type": "text",
                "text": evaluator_prompt(
                    pdf_text,
                    request.message,
                    draft_answer
                )
            }
        ],

        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Please evaluate the draft answer."
                    }
                ]
            }
        ]
    )

    critique = evaluation_completion.content[0].text



    # ---------- OPTIMIZER #2 (Final Answer) ----------
    final_completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "user",
                "content": optimizer_refine_prompt(
                    request.message,
                    draft_answer,
                    critique
                )
            }
        ]
    )

    final_answer = final_completion.choices[0].message.content

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
    """List all conversation sessions"""
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




if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)