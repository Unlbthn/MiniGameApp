# TapToEarn TON (v2)

## Run locally
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r ../requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open: http://localhost:8000

## Env
- DATABASE_URL (optional) e.g. postgresql://...
- TELEGRAM_BOT_TOKEN (required for real task checks: join_chat)
- APP_TZ (optional) default Europe/Istanbul

## Notes
- Weekly leaderboard resets on ISO week change (Monday) in APP_TZ.
- Daily tasks/adwatch reset at midnight in APP_TZ.
- Update Adsgram blockIds in `webapp/app.js`.
