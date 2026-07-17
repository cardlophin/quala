import base64
import os

import requests
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
OWNER = "cardlophin"
REPO = "atmira-hackthon"
BRANCH = "main"


path = "tests/generated/test_clientes_rules.py"
content = """
def test_dummy():
    assert 1 == 1
""".lstrip()

url = f"https://api.github.com/repos/{OWNER}/{REPO}/contents/{path}"

payload = {
    "message": "Add generated validation tests",
    "content": base64.b64encode(content.encode("utf-8")).decode("utf-8"),
    "branch": BRANCH,
}

headers = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
}

resp = requests.put(url, headers=headers, json=payload, timeout=30)
print(resp.status_code)
print(resp.json())
