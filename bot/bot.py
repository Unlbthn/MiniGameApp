from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
)
import logging

# -----------------------------
# AYARLAR
# -----------------------------

BOT_TOKEN = "8419572595:AAEMQSSTS_W2PfTpC12j24oBbbdaIt5WRbk"  # senin token'in
WEBAPP_URL = "https://minigameapp-production.up.railway.app"

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def game_button_inline() -> InlineKeyboardMarkup:
    """Mesaj içinde gösterilecek inline 'Play Game' butonu."""
    keyboard = [
        [
            InlineKeyboardButton(
                text="Play Game 🎮",
                web_app=WebAppInfo(url=WEBAPP_URL),
            )
        ]
    ]
    return InlineKeyboardMarkup(keyboard)


# -----------------------------
# KOMUTLAR
# -----------------------------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logger.info("/start komutu geldi")

    await update.message.reply_text(
        "Tap To Earn Game'e hoş geldin!\n\n"
        "Aşağıdaki butondan oyunu açabilirsin 👇",
        reply_markup=game_button_inline(),
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logger.info("/play komutu geldi")

    await update.message.reply_text(
        "Oyunu başlatmak için aşağıdaki butona dokun 👇",
        reply_markup=game_button_inline(),
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Komutlar:\n"
        "/start - Oyunu başlatma butonunu gösterir\n"
        "/play  - Oyunu tekrar açmak için buton gösterir\n"
    )


# -----------------------------
# MAIN
# -----------------------------

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("play", play))
    app.add_handler(CommandHandler("help", help_cmd))

    logger.info("Bot başlıyor...")
    app.run_polling()


if __name__ == "__main__":
    main()
