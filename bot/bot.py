import asyncio
import logging
import os

from telegram import (
    Update,
    KeyboardButton,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv(
    "WEBAPP_URL",
    "https://taptoearnton-production.up.railway.app/",
)

if not BOT_TOKEN:
    raise RuntimeError(
        "BOT_TOKEN environment variable set edilmemiş. "
        "Örn: export BOT_TOKEN='123456:ABC-DEF'"
    )


# ---------------------------------------------------------------------
# Komutlar
# ---------------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    logger.info("Start from user %s (%s)", user.id, user.username)

    webapp_button = KeyboardButton(
        text="▶️ Play Game",
        web_app=WebAppInfo(url=WEBAPP_URL),
    )
    kb = [[webapp_button]]
    reply_markup = ReplyKeyboardMarkup(
        kb, resize_keyboard=True, one_time_keyboard=False
    )

    await update.message.reply_text(
        "Tap to Earn TON'a hoş geldin! Oyunu başlatmak için aşağıdaki butona tıkla 👇",
        reply_markup=reply_markup,
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Komutlar:\n"
        "/start - Oyunu başlat\n"
        "/play  - WebApp'i aç\n"
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    webapp_button = KeyboardButton(
        text="▶️ Play Game",
        web_app=WebAppInfo(url=WEBAPP_URL),
    )
    kb = [[webapp_button]]
    reply_markup = ReplyKeyboardMarkup(
        kb, resize_keyboard=True, one_time_keyboard=False
    )
    await update.message.reply_text("Oyunu açmak için butona tıkla 👇", reply_markup=reply_markup)


# Metin mesajları: "play", "oyun", vb.
async def text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (update.message.text or "").lower()
    if "play" in text or "oyun" in text or "start" in text:
        await play(update, context)
    else:
        await update.message.reply_text(
            "Oyunu açmak için /start yazabilir veya aşağıdaki butonu kullanabilirsin."
        )


# ---------------------------------------------------------------------
# main
# ---------------------------------------------------------------------
def main() -> None:
    application = ApplicationBuilder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_cmd))
    application.add_handler(CommandHandler("play", play))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_handler))

    logger.info("Bot is starting...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
