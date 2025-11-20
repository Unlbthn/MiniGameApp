from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# BURAYA kendi bot token'ını yaz
BOT_TOKEN = "8419572595:AAEMQSSTS_W2PfTpC12j24oBbbdaIt5WRbk"

# Backend + WebApp'in host edildiği URL (örn: https://senin-app.onrender.com)
WEBAPP_URL = "minigameapp-production.up.railway.app"


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
  await update.message.reply_text(
      "Merhaba! Tap To Earn oyununa başlamak için /play yazabilirsin. 🎮"
  )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE):
  keyboard = [
      [
          InlineKeyboardButton(
              "Oyuna Başla 🎮",
              web_app=WebAppInfo(url=WEBAPP_URL),
          )
      ]
  ]
  reply_markup = InlineKeyboardMarkup(keyboard)
  await update.message.reply_text(
      "Tap To Earn oyununu aşağıdan başlat 👇",
      reply_markup=reply_markup,
  )


def main():
  app = ApplicationBuilder().token(BOT_TOKEN).build()

  app.add_handler(CommandHandler("start", start))
  app.add_handler(CommandHandler("play", play))

  app.run_polling()


if __name__ == "__main__":
  main()
