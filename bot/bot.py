from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
    KeyboardButton,
    ReplyKeyboardMarkup,
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
)
import logging
import os

# -----------------------------
# AYARLAR
# -----------------------------

# 1) BOT TOKEN
# Token'i burada düz yazabilirsin ama güvenlik için repo'yu private tut.
BOT_TOKEN = "8419572595:AAEMQSSTS_W2PfTpC12j24oBbbdaIt5WRbk"  # Örn: "8419......"

# 2) WEBAPP URL
# Railway backend + webapp domenin:
WEBAPP_URL = "https://minigameapp-production.up.railway.app"

# Logging (hata olduğunda terminalde görelim)
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# -----------------------------
# KOMUTLAR
# -----------------------------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /start komutu:
    - Mesaj kutusunun ALTINA kalıcı bir "Oyuna Başla 🎮" butonu koyar (ReplyKeyboard)
    - Butona tıklayınca WebApp açılır.
    """
    keyboard = [
        [
            KeyboardButton(
                text="Oyuna Başla 🎮",
                web_app=WebAppInfo(url=WEBAPP_URL),
            )
        ]
    ]

    reply_markup = ReplyKeyboardMarkup(
        keyboard,
        resize_keyboard=True,    # Butonu klavyeye göre küçült
        one_time_keyboard=False  # Hep altta kalsın
    )

    await update.message.reply_text(
        "Merhaba! Aşağıdaki butondan oyunu başlatabilirsin 👇",
        reply_markup=reply_markup,
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /play komutu:
    - Mesajın içinde inline buton gösterir.
    - Bu da WebApp'i açar.
    """
    keyboard = [
        [
            InlineKeyboardButton(
                text="Oyuna Başla 🎮",
                web_app=WebAppInfo(url=WEBAPP_URL),
            )
        ]
    ]

    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.message.reply_text(
        "Tap To Earn oyununu aşağıdaki butondan başlat 👇",
        reply_markup=reply_markup,
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /help komutu: basit açıklama
    """
    text = (
        "Komutlar:\n"
        "/start - Oyuna başla butonunu gösterir\n"
        "/play - Inline butonla oyunu açar\n\n"
        "Oyunu açtıktan sonra ekrandaki TAP butonuna basarak coin kasabilirsin. 🎮"
    )
    await update.message.reply_text(text)


# -----------------------------
# MAIN
# -----------------------------

def main():
    # Uygulama
    application = ApplicationBuilder().token(BOT_TOKEN).build()

    # Komut handler'ları
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("play", play))
    application.add_handler(CommandHandler("help", help_cmd))

    # Botu başlat
    logger.info("Bot başlıyor...")
    application.run_polling()


if __name__ == "__main__":
    main()
