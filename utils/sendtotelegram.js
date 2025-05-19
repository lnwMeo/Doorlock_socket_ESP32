const axios = require("axios");

exports.sendTelegramMessage = async (text) => {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_GROUP_ID;

  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    });
    console.log("📨 Sent Telegram notification to admin group.");
  } catch (err) {
    console.error("❌ Failed to send Telegram message:", err.message);
  }
};
