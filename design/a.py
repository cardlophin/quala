import os

from dotenv import load_dotenv
from google import genai

_ = load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

client = genai.Client(api_key=GEMINI_API_KEY)

stream = client.interactions.create(
    model="gemini-3.5-flash", input="Explain how AI works", stream=True
)
for event in stream:
    print(event)
